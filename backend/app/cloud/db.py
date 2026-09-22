"""
Results / review-queue / failure store (DynamoDB, one table + one sparse index).

Table  : $DDB_RESULTS_TABLE   (PK email_id)
Index  : by_queue             (PK queue, SK updated_at)  -- SPARSE: only items that need attention have `queue`
         queue == "review"  -> waiting for a human (status NEEDS_REVIEW)
         queue == "failed"  -> processing failed, can be retried

Item attributes (all scalars/lists of str, so no float/Decimal issues):
  email_id, category, status, review_reason, has_defect, defect_fields[], intake (kind, or absent),
  proc_state ("done"|"failed"), queue, attempts, updated_at, git_sha,
  last_error (json str), record_json (full result record), resolutions_json (human decisions, audit trail)

Owner: cloud. The *content* of record_json (comparisons, evidence...) is owned by the pipeline;
this module never inspects it except category/status/review_reason/defect_fields/intake.
"""
import json
import os
from datetime import datetime, timezone
from functools import lru_cache

LIGHT = ["email_id", "category", "status", "review_reason", "has_defect", "defect_fields",
         "proc_state", "queue", "attempts", "updated_at", "git_sha", "last_error", "intake"]


class DBError(Exception):
    pass


class DBNotConfigured(DBError):
    pass


class NotFound(DBError):
    pass


def _now():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")


def _clean(item):
    return {k: v for k, v in item.items() if v is not None}


def _light(item):
    out = {k: item.get(k) for k in LIGHT}
    out["defect_fields"] = list(out.get("defect_fields") or [])
    out["attempts"] = int(out["attempts"]) if out.get("attempts") is not None else None
    if out.get("last_error"):
        try:
            out["last_error"] = json.loads(out["last_error"])
        except ValueError:
            pass
    return out


class ResultsDB:
    def __init__(self, table=None, table_name=None):
        self._table = table
        self._name = table_name or os.environ.get("DDB_RESULTS_TABLE", "")

    @property
    def table(self):
        if self._table is None:
            if not self._name:
                raise DBNotConfigured("DDB_RESULTS_TABLE is not set")
            import boto3
            from botocore.config import Config

            self._table = boto3.resource(
                "dynamodb",
                region_name=os.environ.get("AWS_REGION", "ap-southeast-1"),
                config=Config(retries={"max_attempts": 5, "mode": "standard"}, connect_timeout=5, read_timeout=10),
            ).Table(self._name)
        return self._table

    # ---- writes -----------------------------------------------------------
    def put_result(self, record, queue=None):
        """Store a finished pipeline result. NEEDS_REVIEW results are queued for a human automatically.
        Re-processing keeps the attempt counter and any earlier human resolutions."""
        eid = record["email_id"]
        prev = self.table.get_item(Key={"email_id": eid}).get("Item") or {}
        if queue is None and record.get("status") == "NEEDS_REVIEW":
            queue = "review"
        item = _clean({
            "email_id": eid,
            "category": record.get("category"),
            "status": record.get("status"),
            "review_reason": record.get("review_reason"),
            "has_defect": bool(record.get("has_defect")),
            "defect_fields": list(record.get("defect_fields") or []),
            # awaiting_documents / attachments_missing / details_in_body - only
            # on BL_COMPARISON emails with no files (pipeline/intake.py). Kept
            # on the light row so a list can say "Awaiting documents" rather
            # than "No differences found" without loading every record.
            "intake": (record.get("intake") or {}).get("kind"),
            "proc_state": "done",
            "queue": queue,
            "attempts": int(prev.get("attempts", 0)) + 1,
            "updated_at": _now(),
            "git_sha": os.environ.get("GIT_SHA", "dev"),
            "record_json": json.dumps(record),
            "resolutions_json": prev.get("resolutions_json"),
        })
        self.table.put_item(Item=item)

    def mark_failed(self, email_id, step, kind, message, retryable=True):
        err = json.dumps({"step": step, "kind": kind, "message": str(message)[:500], "retryable": retryable})
        self.table.update_item(
            Key={"email_id": email_id},
            UpdateExpression=("SET proc_state = :f, #q = :q, updated_at = :u, last_error = :e, git_sha = :g, "
                              "attempts = if_not_exists(attempts, :z) + :one"),
            ExpressionAttributeNames={"#q": "queue"},
            ExpressionAttributeValues={":f": "failed", ":q": "failed", ":u": _now(), ":e": err,
                                       ":g": os.environ.get("GIT_SHA", "dev"), ":z": 0, ":one": 1},
        )

    def resolve(self, email_id, resolution, reviewer, updated_record=None):
        """Record a human decision, take the case out of the review queue, optionally replace the record."""
        item = self.table.get_item(Key={"email_id": email_id}).get("Item")
        if not item:
            raise NotFound(email_id)
        history = json.loads(item.get("resolutions_json") or "[]")
        history.append({"at": _now(), "reviewer": reviewer, "resolution": resolution})
        sets = {"resolutions_json": json.dumps(history), "updated_at": _now(), "proc_state": "done"}
        if updated_record is not None:
            sets.update({
                "record_json": json.dumps(updated_record),
                "status": updated_record.get("status"),
                "review_reason": updated_record.get("review_reason"),
                "has_defect": bool(updated_record.get("has_defect")),
                "defect_fields": list(updated_record.get("defect_fields") or []),
            })
        sets = _clean(sets)
        names = {f"#n{i}": k for i, k in enumerate(sets)}
        values = {f":v{i}": v for i, v in enumerate(sets.values())}
        expr = "SET " + ", ".join(f"#n{i} = :v{i}" for i in range(len(sets))) + " REMOVE #q"
        names["#q"] = "queue"
        if updated_record is not None and updated_record.get("review_reason") is None:
            expr += ", #rr"
            names["#rr"] = "review_reason"
        self.table.update_item(Key={"email_id": email_id}, UpdateExpression=expr,
                               ExpressionAttributeNames=names, ExpressionAttributeValues=values,
                               ConditionExpression="attribute_exists(email_id)")
        return self.get(email_id)

    # ---- reads ------------------------------------------------------------
    def get(self, email_id):
        item = self.table.get_item(Key={"email_id": email_id}).get("Item")
        if not item:
            raise NotFound(email_id)
        record = json.loads(item["record_json"]) if item.get("record_json") else {"email_id": email_id}
        record["meta"] = {k: v for k, v in _light(item).items()
                          if k in ("proc_state", "queue", "attempts", "updated_at", "git_sha", "last_error")}
        record["resolutions"] = json.loads(item.get("resolutions_json") or "[]")
        return record

    def _paged(self, fn, **kw):
        items = []
        while True:
            resp = fn(**kw)
            items += resp.get("Items", [])
            if "LastEvaluatedKey" not in resp:
                return items
            kw["ExclusiveStartKey"] = resp["LastEvaluatedKey"]

    def list_results(self):
        names = {f"#a{i}": k for i, k in enumerate(LIGHT)}
        items = self._paged(self.table.scan, ProjectionExpression=", ".join(names),
                            ExpressionAttributeNames=names)
        return sorted((_light(i) for i in items), key=lambda r: r["email_id"])

    def list_queue(self, queue):
        from boto3.dynamodb.conditions import Key

        items = self._paged(self.table.query, IndexName="by_queue",
                            KeyConditionExpression=Key("queue").eq(queue))
        return [_light(i) for i in items]

    def stats(self):
        rows = self.list_results()
        by = lambda k: {v: sum(1 for r in rows if r.get(k) == v) for v in sorted({r.get(k) for r in rows if r.get(k)})}
        return {
            "processed": len(rows),
            "by_category": by("category"),
            "by_status": by("status"),
            "awaiting_review": sum(1 for r in rows if r.get("queue") == "review"),
            "failed": sum(1 for r in rows if r.get("queue") == "failed"),
        }


@lru_cache(maxsize=1)
def get_db():
    db = ResultsDB()
    if not db._name:  # fail early so the API can answer 503 instead of a 500
        raise DBNotConfigured("DDB_RESULTS_TABLE is not set")
    return db
