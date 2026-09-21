"""
Storage layer. Same interface as the organizers' loader.Inbox so pipeline code
does not care where data lives:

    st = get_storage()
    st.emails()                 -> list[dict]   (all email records, cached)
    st.get("email_004")         -> dict
    st.read_bytes(att_path)     -> bytes        att_path exactly as in email["attachments"]
    st.read_text(att_path)      -> str

Mode is chosen by env:
    S3_BUCKET set   -> reads s3://$S3_BUCKET/{inbox,attachments}/...   (deployed)
    S3_BUCKET unset -> reads $DATA_DIR/{inbox,attachments}/... (default ./data) (local dev)

Owner: cloud. Pipeline code should only call the methods above.
"""
import json
import os
import re
from concurrent.futures import ThreadPoolExecutor
from functools import lru_cache
from pathlib import Path

_EMAIL_ID = re.compile(r"^email_\d{3,6}$")
_ALLOWED_PREFIXES = ("inbox/", "attachments/")


class StorageError(Exception):
    pass


class NotFound(StorageError):
    pass


class Storage:
    def __init__(self, bucket=None, data_dir=None, s3_client=None):
        if bucket is None:
            bucket = os.environ.get("S3_BUCKET", "")
        self.bucket = bucket or ""
        self.data_dir = Path(data_dir or os.environ.get("DATA_DIR", "data"))
        self._s3 = s3_client
        self._emails = None

    @property
    def mode(self):
        return "s3" if self.bucket else "local"

    # ---- low-level ----------------------------------------------------
    def _client(self):
        if self._s3 is None:
            import boto3
            from botocore.config import Config

            self._s3 = boto3.client(
                "s3",
                region_name=os.environ.get("AWS_REGION", "ap-southeast-1"),
                config=Config(
                    retries={"max_attempts": 5, "mode": "standard"},
                    connect_timeout=5,
                    read_timeout=20,
                    max_pool_connections=32,
                ),
            )
        return self._s3

    @staticmethod
    def _check_key(key):
        if (
            not isinstance(key, str)
            or key.startswith("/")
            or "\\" in key
            or ".." in key.split("/")
            or not key.startswith(_ALLOWED_PREFIXES)
        ):
            raise NotFound(f"invalid path: {key!r}")
        return key

    def _read_key(self, key):
        key = self._check_key(key)
        if self.bucket:
            try:
                return self._client().get_object(Bucket=self.bucket, Key=key)["Body"].read()
            except self._client().exceptions.NoSuchKey:
                raise NotFound(key)
        path = (self.data_dir / key).resolve()
        if self.data_dir.resolve() not in path.parents:
            raise NotFound(key)
        try:
            return path.read_bytes()
        except FileNotFoundError:
            raise NotFound(key)

    def _list_email_keys(self):
        if self.bucket:
            keys, token = [], None
            while True:
                kw = {"Bucket": self.bucket, "Prefix": "inbox/"}
                if token:
                    kw["ContinuationToken"] = token
                resp = self._client().list_objects_v2(**kw)
                keys += [o["Key"] for o in resp.get("Contents", []) if o["Key"].endswith(".json")]
                if not resp.get("IsTruncated"):
                    break
                token = resp["NextContinuationToken"]
            return sorted(keys)
        d = self.data_dir / "inbox"
        return sorted(f"inbox/{p.name}" for p in d.glob("email_*.json"))

    # ---- public API (loader.Inbox-compatible) ---------------------------
    def emails(self):
        if self._emails is None:
            keys = self._list_email_keys()
            with ThreadPoolExecutor(max_workers=16) as pool:
                self._emails = list(pool.map(lambda k: json.loads(self._read_key(k)), keys))
        return self._emails

    def __iter__(self):
        return iter(self.emails())

    def get(self, email_id):
        if not _EMAIL_ID.match(str(email_id)):
            raise NotFound(f"invalid email id: {email_id!r}")
        return json.loads(self._read_key(f"inbox/{email_id}.json"))

    def read_bytes(self, att_path):
        return self._read_key(att_path)

    def read_text(self, att_path, encoding="utf-8"):
        return self.read_bytes(att_path).decode(encoding, errors="replace")

    def summary(self):
        """Lightweight listing for the API/UI."""
        return [
            {
                "email_id": e["email_id"],
                "from": e.get("from"),
                "subject": e.get("subject"),
                "n_attachments": len(e.get("attachments", [])),
            }
            for e in self.emails()
        ]

    def refresh(self):
        self._emails = None


@lru_cache(maxsize=1)
def get_storage():
    return Storage()
