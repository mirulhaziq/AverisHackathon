/* ============================================================
   Sample data. Fictional companies and people throughout.
   Reference date for every relative age in this file: 2026-09-21.
   ============================================================ */

import type {
  AuditEntry,
  CaseResult,
  ComparisonRow,
  ConfigThresholds,
  EmailCase,
  Extraction,
  ExportRecord,
  FieldKey,
  ImportBatch,
  MappingRow,
  PortAliasRow,
  ReviewTask,
  SuffixRow,
  SynonymRow,
  TimelineStep,
  User,
} from '../types';
import { buildBL, buildSI, regionFor, type DocumentFacsimile, type DocValues } from './documents';

export const SIGNED_IN_USERS: Record<string, User> = {
  Admin: {
    id: 'u-1',
    name: 'Aisyah Rahman',
    email: 'aisyah.rahman@meridianfreight.example',
    role: 'Admin',
    initials: 'AR',
  },
  Reviewer: {
    id: 'u-2',
    name: 'Daniel Okonjo',
    email: 'daniel.okonjo@meridianfreight.example',
    role: 'Reviewer',
    initials: 'DO',
  },
  Operator: {
    id: 'u-3',
    name: 'Mei Ling Tan',
    email: 'meiling.tan@meridianfreight.example',
    role: 'Operator',
    initials: 'MT',
  },
};

/* ---------- small builders ---------- */

function ex(
  value: string | null,
  o: Partial<Extraction> & Pick<Extraction, 'method' | 'confidence' | 'snippet'>,
): Extraction {
  return { value, ...o };
}

function row(
  field: FieldKey,
  si: Extraction,
  bl: Extraction,
  result: ComparisonRow['result'],
  extra: Partial<ComparisonRow> = {},
): ComparisonRow {
  return { field, si, bl, result, ...extra };
}

const R = (doc: 'SI' | 'BL', f: FieldKey) => regionFor(doc, f);

function timeline(
  entries: Array<[string, TimelineStep['state'], string, string?, number?]>,
): TimelineStep[] {
  return entries.map(([step, state, at, detail, durationMs]) => ({
    step,
    state,
    at,
    detail,
    durationMs,
  }));
}

/* ============================================================
   Document values per booking
   ============================================================ */

const BK_88123_SI: DocValues = {
  shipper: ['Selat Agri Exports Sdn Bhd', 'No. 14, Jalan Pelabuhan Utara', '42000 Port Klang, Selangor, Malaysia'],
  consignee: ['Rhine Delta Trading GmbH', 'Speicherstadt 8', '20457 Hamburg, Germany'],
  notifyParty: ['Rhine Delta Trading GmbH', 'Attn. Documentation, Speicherstadt 8', '20457 Hamburg, Germany'],
  portOfLoading: 'Port Klang',
  portOfDischarge: 'Rotterdam',
  containerCount: '3',
  grossWeightKg: '22,000',
  reference: 'SI-88123-R2',
  booking: '88123',
  date: '18 Sep 2026',
  vessel: 'MV Kinta Star',
  voyage: '2634E',
  goods: 'Palm kernel expeller in bulk bags',
  marks: 'SAE/RDT/88123',
  measurement: '58.400 CBM',
  containerNos: ['MRDU 204118/9  SEAL 884201', 'MRDU 771903/4  SEAL 884202', 'TCLU 552016/1  SEAL 884203'],
};

const BK_88123_BL: DocValues = {
  ...BK_88123_SI,
  containerCount: '4',
  containerNos: [
    'MRDU 204118/9  SEAL 884201',
    'MRDU 771903/4  SEAL 884202',
    'TCLU 552016/1  SEAL 884203',
    'TCLU 908774/2  SEAL 884210',
  ],
};

const BK_88140_SI: DocValues = {
  shipper: ['Kuala Perdana Plywood Sdn Bhd', 'Lot 9, Kawasan Perindustrian Bukit Raja', '41050 Klang, Selangor, Malaysia'],
  consignee: ['Adriatic Panel Works d.o.o.', 'Industrijska cesta 22', '6000 Koper, Slovenia'],
  notifyParty: ['Zadar Customs Broker d.o.o.', 'Obala Kralja Petra 4', '23000 Zadar, Croatia'],
  portOfLoading: 'Port Klang',
  portOfDischarge: 'Koper',
  containerCount: '2',
  grossWeightKg: '21,850',
  reference: 'SI-88140',
  booking: '88140',
  date: '19 Sep 2026',
  vessel: 'MV Teluk Intan',
  voyage: '1187W',
  goods: 'Hardwood plywood panels, 18 mm',
  marks: 'KPP/APW/88140',
  measurement: '54.100 CBM',
  containerNos: ['HLXU 331902/7  SEAL 771320', 'HLXU 445116/3  SEAL 771321'],
};

const BK_88140_BL: DocValues = {
  ...BK_88140_SI,
  grossWeightKg: '27,850',
  notifyParty: ['Zadar Customs Broker d.o.o.', 'Obala Kralja Petra 4', '23000 Zadar, Croatia'],
  podLabel: 'Discharge port',
  degradedField: 'grossWeightKg',
};

const BK_88155_SI: DocValues = {
  shipper: ['Bintang Timber Sdn Bhd', 'PT 4471, Jalan Perusahaan 2', '81700 Pasir Gudang, Johor, Malaysia'],
  consignee: ['Northwind Commodities BV', 'Havenkade 117', '3071 AA Rotterdam, Netherlands'],
  notifyParty: ['Northwind Commodities BV', 'Attn. Import Desk, Havenkade 117', '3071 AA Rotterdam, Netherlands'],
  portOfLoading: 'Port Klang',
  portOfDischarge: 'Antwerp',
  containerCount: '5',
  grossWeightKg: '18,400',
  reference: 'SI-88155',
  booking: '88155',
  date: '20 Sep 2026',
  vessel: 'MV Bunga Melati',
  voyage: '0912E',
  goods: 'Sawn rubberwood, kiln dried',
  marks: 'BTB/NWC/88155',
  measurement: '61.200 CBM',
  containerNos: [
    'ONEU 112034/5  SEAL 990110',
    'ONEU 224871/0  SEAL 990111',
    'ONEU 337719/6  SEAL 990112',
    'MSKU 440102/8  SEAL 990113',
    'MSKU 551930/4  SEAL 990114',
  ],
};

const BK_88155_BL: DocValues = {
  ...BK_88155_SI,
  shipper: ['BINTANG TIMBER SDN. BHD.', 'PT 4471, JALAN PERUSAHAAN 2', '81700 PASIR GUDANG, JOHOR, MALAYSIA'],
  portOfLoading: 'PORT KLANG, MALAYSIA',
  polLabel: 'Load port',
  podLabel: 'Discharge port',
};

const BK_88172_SI: DocValues = {
  shipper: ['Delta Ray Chemicals Sdn Bhd', 'Plot 22, Gebeng Industrial Estate', '26080 Kuantan, Pahang, Malaysia'],
  consignee: ['Gulf Polymer Trading LLC', 'Warehouse 41, Jebel Ali Free Zone', 'Dubai, United Arab Emirates'],
  notifyParty: ['Gulf Polymer Trading LLC', 'Warehouse 41, Jebel Ali Free Zone', 'Dubai, United Arab Emirates'],
  portOfLoading: 'Kuantan',
  portOfDischarge: 'Jebel Ali',
  containerCount: '6',
  grossWeightKg: '24,300',
  reference: 'SI-88172',
  booking: '88172',
  date: '20 Sep 2026',
  vessel: 'MV Gebeng Pride',
  voyage: '3301W',
  goods: 'Polypropylene resin in 25 kg bags',
  marks: 'DRC/GPT/88172',
  measurement: '62.800 CBM',
  containerNos: ['CMAU 660013/2  SEAL 660700', 'CMAU 660988/1  SEAL 660701', 'CMAU 661204/7  SEAL 660702'],
};

const BK_88172_BL: DocValues = { ...BK_88172_SI, portOfDischarge: 'JEA', podLabel: 'Discharge port' };

const BK_88188_SI: DocValues = {
  shipper: ['Anchor Bay Logistics Sdn Bhd', '3rd Floor, Wisma Anchor, Jalan Chan Sow Lin', '55200 Kuala Lumpur, Malaysia'],
  consignee: ['Lisbon Stone Importers Lda', 'Rua do Alecrim 44', '1200-015 Lisboa, Portugal'],
  notifyParty: ['Tagus Clearing Agents Lda', 'Avenida 24 de Julho 12', '1200-480 Lisboa, Portugal'],
  portOfLoading: 'Penang',
  portOfDischarge: 'Lisbon',
  containerCount: '4',
  grossWeightKg: '26,700',
  reference: 'SI-88188',
  booking: '88188',
  date: '20 Sep 2026',
  vessel: 'MV Selat Melaka',
  voyage: '4420W',
  goods: 'Granite slabs, crated',
  marks: 'ABL/LSI/88188',
  measurement: '48.900 CBM',
  containerNos: ['EGHU 220311/4  SEAL 442010', 'EGHU 220994/8  SEAL 442011'],
};

const BK_88188_BL: DocValues = {
  ...BK_88188_SI,
  consignee: ['Lisbon Stone Importers Lda', 'Rua do Alecrim 44', '1200-015 Lisboa, Portugal'],
  podLabel: 'Discharge port',
};

const BK_88196_SI: DocValues = {
  shipper: ['Sungai Emas Rubber Sdn Bhd', 'Lot 77, Jalan Getah', '71800 Nilai, Negeri Sembilan, Malaysia'],
  consignee: ['Baltic Tyre Works AS', 'Sadama 12', '10111 Tallinn, Estonia'],
  notifyParty: ['Baltic Tyre Works AS', 'Sadama 12', '10111 Tallinn, Estonia'],
  portOfLoading: 'Port Klang',
  portOfDischarge: 'Hamburg',
  containerCount: '3',
  grossWeightKg: '19,950',
  reference: 'SI-88196',
  booking: '88196',
  date: '21 Sep 2026',
  vessel: 'MV Nilai Express',
  voyage: '2210E',
  goods: 'Standard Malaysian rubber SMR 20',
  marks: 'SER/BTW/88196',
  measurement: '52.300 CBM',
  containerNos: ['OOLU 118820/3  SEAL 118800', 'OOLU 119043/9  SEAL 118801'],
};

const BK_88196_BL: DocValues = { ...BK_88196_SI, portOfDischarge: 'Bremerhaven', podLabel: 'Discharge port' };

/* ============================================================
   Documents attached to each case
   ============================================================ */

export const DOCUMENTS: Record<string, DocumentFacsimile> = {
  'doc-1042-si': buildSI('doc-1042-si', 'SI-88123-R2.pdf', BK_88123_SI),
  'doc-1042-bl': buildBL('doc-1042-bl', 'DRAFT-BL-88123.pdf', BK_88123_BL),
  'doc-1044-si': buildSI('doc-1044-si', 'scan-si-88140.pdf', BK_88140_SI, 'scan'),
  'doc-1044-bl': buildBL('doc-1044-bl', 'scan-draft-bl-88140.pdf', BK_88140_BL, 'scan'),
  'doc-1048-si': buildSI('doc-1048-si', 'SI-88155.pdf', BK_88155_SI),
  'doc-1048-bl': buildBL('doc-1048-bl', 'DRAFT-BL-88155.pdf', BK_88155_BL),
  'doc-1050-si': buildSI('doc-1050-si', 'SI-88172.pdf', BK_88172_SI),
  'doc-1050-bl': buildBL('doc-1050-bl', 'DRAFT-BL-88172.pdf', BK_88172_BL),
  'doc-1052-si': buildSI('doc-1052-si', 'SI-88188.docx', BK_88188_SI),
  'doc-1052-bl': buildBL('doc-1052-bl', 'DRAFT-BL-88188.pdf', BK_88188_BL),
  'doc-1053-si': buildSI('doc-1053-si', 'SI-88196.pdf', BK_88196_SI),
  'doc-1053-bl': buildBL('doc-1053-bl', 'DRAFT-BL-88196.pdf', BK_88196_BL),
};

/* ============================================================
   Cases
   ============================================================ */

const E1042: EmailCase = {
  id: 'E-1042',
  subject: 'Please check draft BL against SI for booking 88123',
  sender: 'documentation@selatagri.example',
  senderName: 'Farah Idris, Selat Agri Exports',
  receivedAt: '2026-09-21 08:12',
  updatedAt: '2026-09-21 08:14',
  category: 'Document comparison request',
  categoryConfidence: 0.97,
  categoryReason:
    'The subject asks for a check of a draft bill of lading against a shipping instruction, and both documents are attached.',
  status: 'Completed',
  result: 'Mismatch found',
  batchId: 'B-2026-09-21-A',
  sourceQuality: 'Text PDF',
  body: `Good morning,

Please find attached our shipping instruction and the draft bill of lading the carrier sent us this morning for booking 88123.

Could you check the two against each other before we approve the draft? We are closing documentation at 17:00 today, so an early answer would help.

Weights were taken at the Northport weighbridge on 17 September.

Thank you,
Farah Idris
Documentation, Selat Agri Exports Sdn Bhd`,
  attachments: [
    {
      id: 'doc-1042-si',
      filename: 'SI-88123-R2.pdf',
      kind: 'SI',
      sizeLabel: '184 KB',
      fileType: 'PDF',
      linkExpiresIn: '14 minutes',
      pageCount: 1,
    },
    {
      id: 'doc-1042-bl',
      filename: 'DRAFT-BL-88123.pdf',
      kind: 'BL',
      sizeLabel: '221 KB',
      fileType: 'PDF',
      linkExpiresIn: '14 minutes',
      pageCount: 2,
    },
  ],
  comparison: [
    row(
      'shipper',
      ex('Selat Agri Exports Sdn Bhd', {
        method: 'Labelled field',
        confidence: 0.99,
        snippet: 'Shipper\nSelat Agri Exports Sdn Bhd\nNo. 14, Jalan Pelabuhan Utara',
        region: R('SI', 'shipper'),
      }),
      ex('Selat Agri Exports Sdn Bhd', {
        method: 'Labelled field',
        confidence: 0.99,
        snippet: 'Shipper / Exporter\nSelat Agri Exports Sdn Bhd\nNo. 14, Jalan Pelabuhan Utara',
        region: R('BL', 'shipper'),
      }),
      'Match',
    ),
    row(
      'consignee',
      ex('Rhine Delta Trading GmbH', {
        method: 'Labelled field',
        confidence: 0.98,
        snippet: 'Consignee\nRhine Delta Trading GmbH\nSpeicherstadt 8',
        region: R('SI', 'consignee'),
      }),
      ex('Rhine Delta Trading GmbH', {
        method: 'Labelled field',
        confidence: 0.98,
        snippet: 'Consignee (complete name and address)\nRhine Delta Trading GmbH\nSpeicherstadt 8',
        region: R('BL', 'consignee'),
      }),
      'Match',
    ),
    row(
      'notifyParty',
      ex('Rhine Delta Trading GmbH', {
        method: 'Labelled field',
        confidence: 0.96,
        snippet: 'Notify party\nRhine Delta Trading GmbH\nAttn. Documentation, Speicherstadt 8',
        region: R('SI', 'notifyParty'),
      }),
      ex('Rhine Delta Trading GmbH', {
        method: 'Labelled field',
        confidence: 0.95,
        snippet: 'Notify party\nRhine Delta Trading GmbH\nAttn. Documentation, Speicherstadt 8',
        region: R('BL', 'notifyParty'),
      }),
      'Match',
    ),
    row(
      'portOfLoading',
      ex('Port Klang', {
        method: 'Labelled field',
        confidence: 0.99,
        snippet: 'Port of loading\nPort Klang',
        region: R('SI', 'portOfLoading'),
      }),
      ex('Port Klang', {
        method: 'Labelled field',
        confidence: 0.99,
        snippet: 'Port of loading\nPort Klang',
        region: R('BL', 'portOfLoading'),
      }),
      'Match',
    ),
    row(
      'portOfDischarge',
      ex('Rotterdam', {
        method: 'Labelled field',
        confidence: 0.99,
        snippet: 'Port of discharge\nRotterdam',
        region: R('SI', 'portOfDischarge'),
      }),
      ex('Rotterdam', {
        method: 'Labelled field',
        confidence: 0.99,
        snippet: 'Port of discharge\nRotterdam',
        region: R('BL', 'portOfDischarge'),
      }),
      'Match',
    ),
    row(
      'containerCount',
      ex('3', {
        method: 'Table cell',
        confidence: 0.97,
        snippet: 'Totals declared by shipper\nContainers  3\nGross weight kg  22,000',
        region: R('SI', 'containerCount'),
      }),
      ex('4', {
        method: 'Table cell',
        confidence: 0.98,
        snippet: 'Total as per carrier tally\nNo. of pkgs  4\nGross weight KGS  22,000',
        region: R('BL', 'containerCount'),
      }),
      'Mismatch',
    ),
    row(
      'grossWeightKg',
      ex('22000', {
        raw: '22,000',
        method: 'Table cell',
        confidence: 0.98,
        snippet: 'Gross weight kg  22,000',
        region: R('SI', 'grossWeightKg'),
      }),
      ex('22000', {
        raw: '22,000',
        method: 'Table cell',
        confidence: 0.98,
        snippet: 'Gross weight KGS  22,000',
        region: R('BL', 'grossWeightKg'),
      }),
      'Match',
      { normalizationNote: 'Matched after normalization: thousands separator removed.' },
    ),
  ],
  timeline: timeline([
    ['ReceiveEmail', 'Done', '2026-09-21 08:12:04', 'Message accepted into batch B-2026-09-21-A.', 180],
    ['ClassifyEmail', 'Done', '2026-09-21 08:12:09', 'Document comparison request, confidence 0.97.', 1420],
    ['FetchAttachments', 'Done', '2026-09-21 08:12:14', '2 files fetched, 405 KB total.', 3110],
    ['ReadDocuments', 'Done', '2026-09-21 08:12:31', 'Text layer present in both files, no OCR needed.', 16800],
    ['ExtractFields', 'Done', '2026-09-21 08:13:02', '14 of 14 values found, lowest confidence 0.95.', 30900],
    ['CompareFields', 'Done', '2026-09-21 08:13:41', '6 fields match, 1 field differs.', 2400],
    ['PublishResult', 'Done', '2026-09-21 08:14:02', 'Result published: Mismatch found.', 800],
  ]),
  reviewHistory: [],
};

const E1043: EmailCase = {
  id: 'E-1043',
  subject: 'Invoice question for last month',
  sender: 'accounts@rhinedelta.example',
  senderName: 'Katrin Vogel, Rhine Delta Trading',
  receivedAt: '2026-09-21 07:48',
  updatedAt: '2026-09-21 07:49',
  category: 'Invoice query',
  categoryConfidence: 0.94,
  categoryReason:
    'The body asks about an invoice line and a credit note, and mentions no shipping instruction or bill of lading.',
  status: 'Completed',
  result: 'Not applicable',
  batchId: 'B-2026-09-21-A',
  body: `Hello,

On invoice MFL-2026-08-4471 there is a line for terminal handling of EUR 148.00 that we do not recognise. Our agreement lists this as included in the all-in rate.

Could you check and send a credit note if it was charged in error?

Regards,
Katrin Vogel
Accounts payable, Rhine Delta Trading GmbH`,
  attachments: [
    {
      id: 'att-1043-inv',
      filename: 'MFL-2026-08-4471.pdf',
      kind: 'Other',
      sizeLabel: '96 KB',
      fileType: 'PDF',
      linkExpiresIn: '14 minutes',
      pageCount: 1,
    },
  ],
  comparison: [],
  timeline: timeline([
    ['ReceiveEmail', 'Done', '2026-09-21 07:48:11', 'Message accepted into batch B-2026-09-21-A.', 160],
    ['ClassifyEmail', 'Done', '2026-09-21 07:48:16', 'Invoice query, confidence 0.94.', 1310],
    ['FetchAttachments', 'Skipped', '2026-09-21 07:48:17', 'Comparison not requested, attachments left unread.'],
    ['ReadDocuments', 'Skipped', '2026-09-21 07:48:17', 'No comparison to run.'],
    ['ExtractFields', 'Skipped', '2026-09-21 07:48:17', 'No comparison to run.'],
    ['CompareFields', 'Skipped', '2026-09-21 07:48:17', 'No comparison to run.'],
    ['PublishResult', 'Done', '2026-09-21 07:49:02', 'Result published: Not applicable.', 640],
  ]),
  reviewHistory: [],
};

const E1044: EmailCase = {
  id: 'E-1044',
  subject: 'Docs attached',
  sender: 'shipping@kualaperdana.example',
  senderName: 'Hafiz Zainal, Kuala Perdana Plywood',
  receivedAt: '2026-09-21 06:31',
  updatedAt: '2026-09-21 06:45',
  category: 'Document comparison request',
  categoryConfidence: 0.81,
  categoryReason:
    'The subject is short, but two attachments were recognised as a shipping instruction and a draft bill of lading.',
  status: 'Waiting for review',
  result: 'Needs review',
  batchId: 'B-2026-09-21-A',
  sourceQuality: 'Scan',
  body: `Docs attached. Pls check and revert.

Sent from my phone`,
  attachments: [
    {
      id: 'doc-1044-si',
      filename: 'scan-si-88140.pdf',
      kind: 'SI',
      sizeLabel: '1.9 MB',
      fileType: 'Scanned PDF',
      linkExpiresIn: '14 minutes',
      pageCount: 1,
    },
    {
      id: 'doc-1044-bl',
      filename: 'scan-draft-bl-88140.pdf',
      kind: 'BL',
      sizeLabel: '2.4 MB',
      fileType: 'Scanned PDF',
      linkExpiresIn: '14 minutes',
      pageCount: 2,
    },
  ],
  comparison: [
    row(
      'shipper',
      ex('Kuala Perdana Plywood Sdn Bhd', {
        method: 'OCR',
        confidence: 0.91,
        snippet: 'Shipper\nKuala Perdana Plywood Sdn Bhd\nLot 9, Kawasan Perindustrian Bukit Raja',
        region: R('SI', 'shipper'),
      }),
      ex('Kuala Perdana Plywood Sdn Bhd', {
        method: 'OCR',
        confidence: 0.9,
        snippet: 'Shipper / Exporter\nKuala Perdana Plywood Sdn Bhd',
        region: R('BL', 'shipper'),
      }),
      'Match',
    ),
    row(
      'consignee',
      ex('Adriatic Panel Works d.o.o.', {
        method: 'OCR',
        confidence: 0.88,
        snippet: 'Consignee\nAdriatic Panel Works d.o.o.\nIndustrijska cesta 22',
        region: R('SI', 'consignee'),
      }),
      ex('Adriatic Panel Works d.o.o.', {
        method: 'OCR',
        confidence: 0.62,
        snippet: 'Consignee (complete name and address)\nAdriatic Panel Works d.o.o.',
        region: R('BL', 'consignee'),
      }),
      'Needs review',
      { reviewReason: 'The scan was hard to read, so the value is not certain.' },
    ),
    row(
      'notifyParty',
      ex('Zadar Customs Broker d.o.o.', {
        method: 'OCR',
        confidence: 0.89,
        snippet: 'Notify party\nZadar Customs Broker d.o.o.\nObala Kralja Petra 4',
        region: R('SI', 'notifyParty'),
      }),
      ex('Zadar Customs Broker d.o.o.', {
        method: 'OCR',
        confidence: 0.58,
        snippet: 'Notify party\nZadar Customs Broker d.o.o.\nObala Kralja Petra 4',
        region: R('BL', 'notifyParty'),
      }),
      'Needs review',
      { reviewReason: 'The label on the document does not clearly name this field.' },
    ),
    row(
      'portOfLoading',
      ex('Port Klang', {
        method: 'OCR',
        confidence: 0.95,
        snippet: 'Port of loading\nPort Klang',
        region: R('SI', 'portOfLoading'),
      }),
      ex('Port Klang', {
        method: 'OCR',
        confidence: 0.94,
        snippet: 'Port of loading\nPort Klang',
        region: R('BL', 'portOfLoading'),
      }),
      'Match',
    ),
    row(
      'portOfDischarge',
      ex('Koper', {
        method: 'OCR',
        confidence: 0.93,
        snippet: 'Port of discharge\nKoper',
        region: R('SI', 'portOfDischarge'),
      }),
      ex('Koper', {
        method: 'OCR',
        confidence: 0.92,
        snippet: 'Discharge port\nKoper',
        region: R('BL', 'portOfDischarge'),
      }),
      'Match',
    ),
    row(
      'containerCount',
      ex('2', {
        method: 'OCR',
        confidence: 0.94,
        snippet: 'Containers  2',
        region: R('SI', 'containerCount'),
      }),
      ex('2', {
        method: 'OCR',
        confidence: 0.93,
        snippet: 'No. of pkgs  2',
        region: R('BL', 'containerCount'),
      }),
      'Match',
    ),
    row(
      'grossWeightKg',
      ex('21850', {
        raw: '21,850',
        method: 'OCR',
        confidence: 0.92,
        snippet: 'Gross weight kg  21,850',
        region: R('SI', 'grossWeightKg'),
      }),
      ex('27850', {
        raw: '27,850',
        method: 'OCR',
        confidence: 0.54,
        snippet: 'Gross weight KGS  27,850',
        region: R('BL', 'grossWeightKg'),
      }),
      'Needs review',
      {
        reviewReason:
          'The scan was hard to read, so the value is not certain. Two readings were found for this figure.',
      },
    ),
  ],
  timeline: timeline([
    ['ReceiveEmail', 'Done', '2026-09-21 06:31:02', 'Message accepted into batch B-2026-09-21-A.', 190],
    ['ClassifyEmail', 'Done', '2026-09-21 06:31:08', 'Document comparison request, confidence 0.81.', 1610],
    ['FetchAttachments', 'Done', '2026-09-21 06:31:19', '2 files fetched, 4.3 MB total.', 9800],
    ['ReadDocuments', 'Done', '2026-09-21 06:33:44', 'No text layer found. OCR run on 3 pages at 300 dpi.', 144000],
    ['ExtractFields', 'Done', '2026-09-21 06:38:12', '14 of 14 values found, 3 below the review threshold.', 51000],
    ['CompareFields', 'Done', '2026-09-21 06:44:10', '4 fields match, 3 fields need review.', 2600],
    ['PublishResult', 'Waiting', '2026-09-21 06:45:01', 'Held until 3 review tasks are resolved.'],
  ]),
  reviewHistory: [],
};

const E1045: EmailCase = {
  id: 'E-1045',
  subject: 'Urgent, please check documents',
  sender: 'ops@anchorbaylogistics.example',
  senderName: 'Siti Nurhaliza Bakar, Anchor Bay Logistics',
  receivedAt: '2026-09-21 05:02',
  updatedAt: '2026-09-21 05:03',
  category: 'Document comparison request',
  categoryConfidence: 0.72,
  categoryReason:
    'The body asks for a document check, but nothing was attached, so the request cannot be confirmed from documents.',
  status: 'Waiting for review',
  result: 'Needs review',
  batchId: 'B-2026-09-21-A',
  body: `Hi team,

Urgent please. Can you check the documents for the Lisbon shipment and confirm the consignee is right before the carrier issues the original?

The vessel cuts off tonight.

Thanks
Siti`,
  attachments: [],
  comparison: [],
  timeline: timeline([
    ['ReceiveEmail', 'Done', '2026-09-21 05:02:08', 'Message accepted into batch B-2026-09-21-A.', 170],
    ['ClassifyEmail', 'Done', '2026-09-21 05:02:13', 'Document comparison request, confidence 0.72.', 1380],
    ['FetchAttachments', 'Done', '2026-09-21 05:02:15', 'No attachments found on the message.', 420],
    ['ReadDocuments', 'Skipped', '2026-09-21 05:02:15', 'No documents to read.'],
    ['ExtractFields', 'Skipped', '2026-09-21 05:02:15', 'No documents to read.'],
    ['CompareFields', 'Skipped', '2026-09-21 05:02:15', 'No documents to compare.'],
    ['PublishResult', 'Waiting', '2026-09-21 05:03:01', 'Held until 1 review task is resolved.'],
  ]),
  reviewHistory: [],
  intake: {
    kind: 'attachments_missing',
    decidedBy: 'rule',
    reason: 'The email refers to documents that should be attached, and none are.',
    evidence:
      'Urgent please. Can you check the documents for the Lisbon shipment and confirm the consignee is right before the carrier issues the original?',
  },
};

const E1046: EmailCase = {
  id: 'E-1046',
  subject: 'Your bill of lading is on hold, act within 24 hours',
  sender: 'billing-alerts@secure-freight-portal.example',
  senderName: 'Freight Settlement Notice',
  receivedAt: '2026-09-21 04:17',
  updatedAt: '2026-09-21 04:18',
  category: 'Spam',
  categoryConfidence: 0.96,
  categoryReason:
    'The sender domain is unknown to this inbox, the message presses for payment within a deadline, and it names no booking held by this office.',
  status: 'Completed',
  result: 'Not applicable',
  batchId: 'B-2026-09-21-A',
  body: `FINAL NOTICE

Your bill of lading has been placed on hold pending a release fee of USD 340. Release must be authorised within 24 hours or the container will be moved to long term storage at your cost.

Pay now using the secure link below to avoid demurrage.

Freight Settlement Department`,
  attachments: [],
  comparison: [],
  timeline: timeline([
    ['ReceiveEmail', 'Done', '2026-09-21 04:17:03', 'Message accepted into batch B-2026-09-21-A.', 150],
    ['ClassifyEmail', 'Done', '2026-09-21 04:17:09', 'Spam, confidence 0.96.', 1240],
    ['FetchAttachments', 'Skipped', '2026-09-21 04:17:09', 'Spam is not processed further.'],
    ['ReadDocuments', 'Skipped', '2026-09-21 04:17:09', 'Spam is not processed further.'],
    ['ExtractFields', 'Skipped', '2026-09-21 04:17:09', 'Spam is not processed further.'],
    ['CompareFields', 'Skipped', '2026-09-21 04:17:09', 'Spam is not processed further.'],
    ['PublishResult', 'Done', '2026-09-21 04:18:01', 'Result published: Not applicable.', 610],
  ]),
  reviewHistory: [],
};

const E1047: EmailCase = {
  id: 'E-1047',
  subject: 'Draft BL for approval, booking 88164',
  sender: 'docs@havenportlines.example',
  senderName: 'Carrier documentation, Havenport Lines',
  receivedAt: '2026-09-21 03:40',
  updatedAt: '2026-09-21 03:58',
  category: 'Document comparison request',
  categoryConfidence: 0.95,
  categoryReason: 'The subject names a draft bill of lading for approval and two documents were attached.',
  status: 'Failed',
  result: 'Failed',
  batchId: 'B-2026-09-21-A',
  body: `Please find the draft bill of lading for booking 88164 attached for your approval, together with the shipping instruction we hold on file.

Kindly confirm by return so we can release the original set.

Havenport Lines, Documentation`,
  attachments: [
    {
      id: 'att-1047-si',
      filename: 'SI-88164.pdf',
      kind: 'SI',
      sizeLabel: '212 KB',
      fileType: 'PDF',
      linkExpiresIn: '14 minutes',
      pageCount: 1,
    },
    {
      id: 'att-1047-bl',
      filename: 'DRAFT-BL-88164.pdf',
      kind: 'BL',
      sizeLabel: '0 KB',
      fileType: 'PDF',
      linkExpiresIn: '14 minutes',
      pageCount: 0,
    },
  ],
  comparison: [],
  failure: {
    step: 'ReadDocuments',
    code: 'DOC_READ_FAILED',
    message:
      'DRAFT-BL-88164.pdf could not be opened. The file ends before its page data starts, which usually means the upload was cut short. Three attempts were made, the last at 03:58.',
    attempts: 3,
    nextAction:
      'Ask the sender to resend the draft bill of lading, then use Retry from failed step. Restart re-runs the case from the beginning.',
  },
  timeline: timeline([
    ['ReceiveEmail', 'Done', '2026-09-21 03:40:06', 'Message accepted into batch B-2026-09-21-A.', 180],
    ['ClassifyEmail', 'Done', '2026-09-21 03:40:12', 'Document comparison request, confidence 0.95.', 1390],
    ['FetchAttachments', 'Done', '2026-09-21 03:40:20', '2 files fetched. One file is 0 KB.', 4200],
    [
      'ReadDocuments',
      'Failed',
      '2026-09-21 03:58:44',
      'DOC_READ_FAILED on DRAFT-BL-88164.pdf after 3 attempts.',
      1104000,
    ],
    ['ExtractFields', 'Skipped', '2026-09-21 03:58:44', 'Previous step failed.'],
    ['CompareFields', 'Skipped', '2026-09-21 03:58:44', 'Previous step failed.'],
    ['PublishResult', 'Done', '2026-09-21 03:58:50', 'Result published: Failed.', 520],
  ]),
  reviewHistory: [],
};

const E1048: EmailCase = {
  id: 'E-1048',
  subject: 'BL draft vs SI, booking 88155',
  sender: 'export@bintangtimber.example',
  senderName: 'Rashid Hamzah, Bintang Timber',
  receivedAt: '2026-09-21 02:55',
  updatedAt: '2026-09-21 02:58',
  category: 'Document comparison request',
  categoryConfidence: 0.98,
  categoryReason: 'The subject names both documents and the booking, and both were attached as text PDFs.',
  status: 'Completed',
  result: 'No mismatch detected',
  batchId: 'B-2026-09-20-B',
  sourceQuality: 'Text PDF',
  body: `Dear team,

Attached are the SI and the carrier's draft BL for booking 88155. Please confirm they agree so we can approve the draft today.

Note the carrier writes our company name in capitals and adds the country to the load port. That has been fine on previous shipments.

Best regards,
Rashid Hamzah
Export documentation, Bintang Timber Sdn Bhd`,
  attachments: [
    {
      id: 'doc-1048-si',
      filename: 'SI-88155.pdf',
      kind: 'SI',
      sizeLabel: '176 KB',
      fileType: 'PDF',
      linkExpiresIn: '14 minutes',
      pageCount: 1,
    },
    {
      id: 'doc-1048-bl',
      filename: 'DRAFT-BL-88155.pdf',
      kind: 'BL',
      sizeLabel: '244 KB',
      fileType: 'PDF',
      linkExpiresIn: '14 minutes',
      pageCount: 2,
    },
  ],
  comparison: [
    row(
      'shipper',
      ex('Bintang Timber Sdn Bhd', {
        raw: 'Bintang Timber Sdn Bhd',
        method: 'Labelled field',
        confidence: 0.99,
        snippet: 'Shipper\nBintang Timber Sdn Bhd\nPT 4471, Jalan Perusahaan 2',
        region: R('SI', 'shipper'),
      }),
      ex('Bintang Timber Sdn Bhd', {
        raw: 'BINTANG TIMBER SDN. BHD.',
        method: 'Labelled field',
        confidence: 0.98,
        snippet: 'Shipper / Exporter\nBINTANG TIMBER SDN. BHD.\nPT 4471, JALAN PERUSAHAAN 2',
        region: R('BL', 'shipper'),
        normalizedFrom: 'BINTANG TIMBER SDN. BHD.',
      }),
      'Match',
      {
        normalizationNote:
          'Matched after normalization: letter case and the company suffix punctuation in "SDN. BHD." were ignored.',
      },
    ),
    row(
      'consignee',
      ex('Northwind Commodities BV', {
        method: 'Labelled field',
        confidence: 0.99,
        snippet: 'Consignee\nNorthwind Commodities BV\nHavenkade 117',
        region: R('SI', 'consignee'),
      }),
      ex('Northwind Commodities BV', {
        method: 'Labelled field',
        confidence: 0.99,
        snippet: 'Consignee (complete name and address)\nNorthwind Commodities BV\nHavenkade 117',
        region: R('BL', 'consignee'),
      }),
      'Match',
    ),
    row(
      'notifyParty',
      ex('Northwind Commodities BV', {
        method: 'Labelled field',
        confidence: 0.97,
        snippet: 'Notify party\nNorthwind Commodities BV\nAttn. Import Desk, Havenkade 117',
        region: R('SI', 'notifyParty'),
      }),
      ex('Northwind Commodities BV', {
        method: 'Labelled field',
        confidence: 0.97,
        snippet: 'Notify party\nNorthwind Commodities BV\nAttn. Import Desk, Havenkade 117',
        region: R('BL', 'notifyParty'),
      }),
      'Match',
    ),
    row(
      'portOfLoading',
      ex('Port Klang', {
        raw: 'Port Klang',
        method: 'Labelled field',
        confidence: 0.99,
        snippet: 'Port of loading\nPort Klang',
        region: R('SI', 'portOfLoading'),
      }),
      ex('Port Klang', {
        raw: 'PORT KLANG, MALAYSIA',
        method: 'Labelled field',
        confidence: 0.96,
        snippet: 'Load port\nPORT KLANG, MALAYSIA',
        region: R('BL', 'portOfLoading'),
        normalizedFrom: 'PORT KLANG, MALAYSIA',
      }),
      'Match',
      {
        normalizationNote:
          'Matched after normalization: the label "Load port" maps to port of loading, and the country was dropped. Alias PORT KLANG, MALAYSIA resolves to Port Klang (MYPKG).',
      },
    ),
    row(
      'portOfDischarge',
      ex('Antwerp', {
        method: 'Labelled field',
        confidence: 0.98,
        snippet: 'Port of discharge\nAntwerp',
        region: R('SI', 'portOfDischarge'),
      }),
      ex('Antwerp', {
        method: 'Labelled field',
        confidence: 0.98,
        snippet: 'Discharge port\nAntwerp',
        region: R('BL', 'portOfDischarge'),
      }),
      'Match',
    ),
    row(
      'containerCount',
      ex('5', {
        method: 'Table cell',
        confidence: 0.98,
        snippet: 'Containers  5',
        region: R('SI', 'containerCount'),
      }),
      ex('5', {
        method: 'Table cell',
        confidence: 0.98,
        snippet: 'No. of pkgs  5',
        region: R('BL', 'containerCount'),
      }),
      'Match',
    ),
    row(
      'grossWeightKg',
      ex('18400', {
        raw: '18,400',
        method: 'Table cell',
        confidence: 0.98,
        snippet: 'Gross weight kg  18,400',
        region: R('SI', 'grossWeightKg'),
      }),
      ex('18400', {
        raw: '18,400',
        method: 'Table cell',
        confidence: 0.98,
        snippet: 'Gross weight KGS  18,400',
        region: R('BL', 'grossWeightKg'),
      }),
      'Match',
      { normalizationNote: 'Matched after normalization: thousands separator removed.' },
    ),
  ],
  timeline: timeline([
    ['ReceiveEmail', 'Done', '2026-09-21 02:55:02', 'Message accepted into batch B-2026-09-20-B.', 160],
    ['ClassifyEmail', 'Done', '2026-09-21 02:55:07', 'Document comparison request, confidence 0.98.', 1290],
    ['FetchAttachments', 'Done', '2026-09-21 02:55:13', '2 files fetched, 420 KB total.', 2900],
    ['ReadDocuments', 'Done', '2026-09-21 02:55:28', 'Text layer present in both files, no OCR needed.', 14700],
    ['ExtractFields', 'Done', '2026-09-21 02:56:44', '14 of 14 values found, lowest confidence 0.96.', 28400],
    ['CompareFields', 'Done', '2026-09-21 02:57:31', '7 fields match, 2 matched after normalization.', 2100],
    ['PublishResult', 'Done', '2026-09-21 02:58:04', 'Result published: No mismatch detected.', 700],
  ]),
  reviewHistory: [],
};

const E1049: EmailCase = {
  id: 'E-1049',
  subject: 'Change of contact for our documentation team',
  sender: 'hr@northwindcommodities.example',
  senderName: 'Joost Bakker, Northwind Commodities',
  receivedAt: '2026-09-20 16:22',
  updatedAt: '2026-09-20 16:24',
  category: 'General message',
  categoryConfidence: 0.68,
  categoryReason:
    'The message reads as an administrative notice, but it also mentions a booking and an instruction, so the category is not certain.',
  status: 'Waiting for review',
  result: 'Needs review',
  batchId: 'B-2026-09-20-B',
  body: `Dear partners,

From 1 October our documentation mailbox changes to import-docs@northwindcommodities.example. Please direct all draft bills of lading and shipping instructions there from that date.

For booking 88155 currently in progress, please continue to use the existing address.

Kind regards,
Joost Bakker
Northwind Commodities BV`,
  attachments: [],
  comparison: [],
  timeline: timeline([
    ['ReceiveEmail', 'Done', '2026-09-20 16:22:04', 'Message accepted into batch B-2026-09-20-B.', 170],
    ['ClassifyEmail', 'Done', '2026-09-20 16:22:10', 'General message, confidence 0.68, below the 0.75 threshold.', 1520],
    ['FetchAttachments', 'Done', '2026-09-20 16:22:12', 'No attachments found on the message.', 380],
    ['ReadDocuments', 'Skipped', '2026-09-20 16:22:12', 'No documents to read.'],
    ['ExtractFields', 'Skipped', '2026-09-20 16:22:12', 'No documents to read.'],
    ['CompareFields', 'Skipped', '2026-09-20 16:22:12', 'No documents to compare.'],
    ['PublishResult', 'Waiting', '2026-09-20 16:24:01', 'Held until 1 review task is resolved.'],
  ]),
  reviewHistory: [],
};

const E1050: EmailCase = {
  id: 'E-1050',
  subject: 'Check draft BL, booking 88172, Jebel Ali',
  sender: 'logistics@deltaraychem.example',
  senderName: 'Nurul Huda Ismail, Delta Ray Chemicals',
  receivedAt: '2026-09-20 05:48',
  updatedAt: '2026-09-20 06:02',
  category: 'Document comparison request',
  categoryConfidence: 0.96,
  categoryReason: 'The subject asks for a check of a draft bill of lading and both documents were attached.',
  status: 'Waiting for review',
  result: 'Needs review',
  batchId: 'B-2026-09-20-A',
  sourceQuality: 'Text PDF',
  body: `Dear documentation team,

Please compare the attached draft BL for booking 88172 with our shipping instruction. The discharge port is written differently by the carrier and we want to be sure it is the same place before approval.

Thank you,
Nurul Huda Ismail
Logistics, Delta Ray Chemicals Sdn Bhd`,
  attachments: [
    {
      id: 'doc-1050-si',
      filename: 'SI-88172.pdf',
      kind: 'SI',
      sizeLabel: '168 KB',
      fileType: 'PDF',
      linkExpiresIn: '14 minutes',
      pageCount: 1,
    },
    {
      id: 'doc-1050-bl',
      filename: 'DRAFT-BL-88172.pdf',
      kind: 'BL',
      sizeLabel: '236 KB',
      fileType: 'PDF',
      linkExpiresIn: '14 minutes',
      pageCount: 2,
    },
  ],
  comparison: [
    row(
      'shipper',
      ex('Delta Ray Chemicals Sdn Bhd', {
        method: 'Labelled field',
        confidence: 0.98,
        snippet: 'Shipper\nDelta Ray Chemicals Sdn Bhd',
        region: R('SI', 'shipper'),
      }),
      ex('Delta Ray Chemicals Sdn Bhd', {
        method: 'Labelled field',
        confidence: 0.98,
        snippet: 'Shipper / Exporter\nDelta Ray Chemicals Sdn Bhd',
        region: R('BL', 'shipper'),
      }),
      'Match',
    ),
    row(
      'consignee',
      ex('Gulf Polymer Trading LLC', {
        method: 'Labelled field',
        confidence: 0.97,
        snippet: 'Consignee\nGulf Polymer Trading LLC',
        region: R('SI', 'consignee'),
      }),
      ex('Gulf Polymer Trading LLC', {
        method: 'Labelled field',
        confidence: 0.97,
        snippet: 'Consignee (complete name and address)\nGulf Polymer Trading LLC',
        region: R('BL', 'consignee'),
      }),
      'Match',
    ),
    row(
      'notifyParty',
      ex('Gulf Polymer Trading LLC', {
        method: 'Labelled field',
        confidence: 0.96,
        snippet: 'Notify party\nGulf Polymer Trading LLC',
        region: R('SI', 'notifyParty'),
      }),
      ex('Gulf Polymer Trading LLC', {
        method: 'Labelled field',
        confidence: 0.96,
        snippet: 'Notify party\nGulf Polymer Trading LLC',
        region: R('BL', 'notifyParty'),
      }),
      'Match',
    ),
    row(
      'portOfLoading',
      ex('Kuantan', {
        method: 'Labelled field',
        confidence: 0.98,
        snippet: 'Port of loading\nKuantan',
        region: R('SI', 'portOfLoading'),
      }),
      ex('Kuantan', {
        method: 'Labelled field',
        confidence: 0.98,
        snippet: 'Port of loading\nKuantan',
        region: R('BL', 'portOfLoading'),
      }),
      'Match',
    ),
    row(
      'portOfDischarge',
      ex('Jebel Ali', {
        method: 'Labelled field',
        confidence: 0.97,
        snippet: 'Port of discharge\nJebel Ali',
        region: R('SI', 'portOfDischarge'),
      }),
      ex('JEA', {
        raw: 'JEA',
        method: 'Labelled field',
        confidence: 0.45,
        snippet: 'Discharge port\nJEA',
        region: R('BL', 'portOfDischarge'),
      }),
      'Needs review',
      { reviewReason: 'The port name on the document is not in the alias list.' },
    ),
    row(
      'containerCount',
      ex('6', {
        method: 'Table cell',
        confidence: 0.97,
        snippet: 'Containers  6',
        region: R('SI', 'containerCount'),
      }),
      ex('6', {
        method: 'Table cell',
        confidence: 0.97,
        snippet: 'No. of pkgs  6',
        region: R('BL', 'containerCount'),
      }),
      'Match',
    ),
    row(
      'grossWeightKg',
      ex('24300', {
        raw: '24,300',
        method: 'Table cell',
        confidence: 0.98,
        snippet: 'Gross weight kg  24,300',
        region: R('SI', 'grossWeightKg'),
      }),
      ex('24300', {
        raw: '24,300',
        method: 'Table cell',
        confidence: 0.98,
        snippet: 'Gross weight KGS  24,300',
        region: R('BL', 'grossWeightKg'),
      }),
      'Match',
      { normalizationNote: 'Matched after normalization: thousands separator removed.' },
    ),
  ],
  timeline: timeline([
    ['ReceiveEmail', 'Done', '2026-09-20 05:48:03', 'Message accepted into batch B-2026-09-20-A.', 170],
    ['ClassifyEmail', 'Done', '2026-09-20 05:48:09', 'Document comparison request, confidence 0.96.', 1330],
    ['FetchAttachments', 'Done', '2026-09-20 05:48:15', '2 files fetched, 404 KB total.', 3000],
    ['ReadDocuments', 'Done', '2026-09-20 05:48:31', 'Text layer present in both files, no OCR needed.', 15900],
    ['ExtractFields', 'Done', '2026-09-20 05:59:18', '14 of 14 values found, 1 below the review threshold.', 29800],
    ['CompareFields', 'Done', '2026-09-20 06:01:22', '6 fields match, 1 field needs review.', 2200],
    ['PublishResult', 'Waiting', '2026-09-20 06:02:01', 'Held until 1 review task is resolved.'],
  ]),
  reviewHistory: [],
};

const E1051: EmailCase = {
  id: 'E-1051',
  subject: 'New shipping instruction for booking 88201',
  sender: 'export@sungaiemasrubber.example',
  senderName: 'Lim Wei Jian, Sungai Emas Rubber',
  receivedAt: '2026-09-20 03:11',
  updatedAt: '2026-09-20 03:12',
  category: 'New SI request',
  categoryConfidence: 0.93,
  categoryReason:
    'The message asks for a new shipping instruction to be raised and supplies the particulars, with no draft bill of lading to compare.',
  status: 'Completed',
  result: 'Not applicable',
  batchId: 'B-2026-09-20-A',
  body: `Hello,

Please raise a shipping instruction for booking 88201 with the following particulars.

Shipper: Sungai Emas Rubber Sdn Bhd
Consignee: Baltic Tyre Works AS
Port of loading: Port Klang
Port of discharge: Tallinn
Containers: 2 x 40 HC
Gross weight: 19,200 kg
Goods: Standard Malaysian rubber SMR 20

Cut off is Thursday 14:00.

Regards,
Lim Wei Jian`,
  attachments: [],
  comparison: [],
  timeline: timeline([
    ['ReceiveEmail', 'Done', '2026-09-20 03:11:05', 'Message accepted into batch B-2026-09-20-A.', 160],
    ['ClassifyEmail', 'Done', '2026-09-20 03:11:11', 'New SI request, confidence 0.93.', 1410],
    ['FetchAttachments', 'Done', '2026-09-20 03:11:13', 'No attachments found on the message.', 360],
    ['ReadDocuments', 'Skipped', '2026-09-20 03:11:13', 'No comparison requested.'],
    ['ExtractFields', 'Skipped', '2026-09-20 03:11:13', 'No comparison requested.'],
    ['CompareFields', 'Skipped', '2026-09-20 03:11:13', 'No comparison requested.'],
    ['PublishResult', 'Done', '2026-09-20 03:12:02', 'Result published: Not applicable.', 590],
  ]),
  reviewHistory: [],
  // what the backend reads out of this body (pipeline/intake.py extract_body)
  bodyFields: [
    { doc: 'SI', field: 'shipper', value: 'Sungai Emas Rubber Sdn Bhd', snippet: 'Shipper: Sungai Emas Rubber Sdn Bhd' },
    { doc: 'SI', field: 'consignee', value: 'Baltic Tyre Works AS', snippet: 'Consignee: Baltic Tyre Works AS' },
    { doc: 'SI', field: 'notifyParty', value: null, snippet: null },
    { doc: 'SI', field: 'portOfLoading', value: 'Port Klang', snippet: 'Port of loading: Port Klang' },
    { doc: 'SI', field: 'portOfDischarge', value: 'Tallinn', snippet: 'Port of discharge: Tallinn' },
    { doc: 'SI', field: 'containerCount', value: '2 x 40 HC', snippet: 'Containers: 2 x 40 HC' },
    { doc: 'SI', field: 'grossWeightKg', value: '19,200 kg', snippet: 'Gross weight: 19,200 kg' },
  ],
};

const E1052: EmailCase = {
  id: 'E-1052',
  subject: 'Please verify consignee on draft BL 88188',
  sender: 'ops@anchorbaylogistics.example',
  senderName: 'Siti Nurhaliza Bakar, Anchor Bay Logistics',
  receivedAt: '2026-09-21 07:05',
  updatedAt: '2026-09-21 07:18',
  category: 'Document comparison request',
  categoryConfidence: 0.95,
  categoryReason: 'The subject asks for verification of a draft bill of lading and both documents were attached.',
  status: 'Waiting for review',
  result: 'Needs review',
  batchId: 'B-2026-09-21-A',
  sourceQuality: 'Text PDF',
  body: `Hi,

The draft BL for booking 88188 lists the consignee twice, once in the consignee box and once again in the goods description. Please verify which one should stand before we approve.

The shipping instruction is attached as a Word file this time.

Thanks,
Siti Nurhaliza Bakar
Anchor Bay Logistics Sdn Bhd`,
  attachments: [
    {
      id: 'doc-1052-si',
      filename: 'SI-88188.docx',
      kind: 'SI',
      sizeLabel: '58 KB',
      fileType: 'DOCX',
      linkExpiresIn: '14 minutes',
      pageCount: 1,
    },
    {
      id: 'doc-1052-bl',
      filename: 'DRAFT-BL-88188.pdf',
      kind: 'BL',
      sizeLabel: '228 KB',
      fileType: 'PDF',
      linkExpiresIn: '14 minutes',
      pageCount: 2,
    },
  ],
  comparison: [
    row(
      'shipper',
      ex('Anchor Bay Logistics Sdn Bhd', {
        method: 'Labelled field',
        confidence: 0.98,
        snippet: 'Shipper\nAnchor Bay Logistics Sdn Bhd',
        region: R('SI', 'shipper'),
      }),
      ex('Anchor Bay Logistics Sdn Bhd', {
        method: 'Labelled field',
        confidence: 0.98,
        snippet: 'Shipper / Exporter\nAnchor Bay Logistics Sdn Bhd',
        region: R('BL', 'shipper'),
      }),
      'Match',
    ),
    row(
      'consignee',
      ex('Lisbon Stone Importers Lda', {
        method: 'Labelled field',
        confidence: 0.97,
        snippet: 'Consignee\nLisbon Stone Importers Lda\nRua do Alecrim 44',
        region: R('SI', 'consignee'),
      }),
      ex(null, {
        method: 'Labelled field',
        confidence: 0.49,
        snippet: 'Consignee (complete name and address)\nLisbon Stone Importers Lda\n… also in goods: Tagus Clearing Agents Lda as consignee of record',
        region: R('BL', 'consignee'),
      }),
      'Needs review',
      { reviewReason: 'Two values were found for the same field.' },
    ),
    row(
      'notifyParty',
      ex('Tagus Clearing Agents Lda', {
        method: 'Labelled field',
        confidence: 0.96,
        snippet: 'Notify party\nTagus Clearing Agents Lda',
        region: R('SI', 'notifyParty'),
      }),
      ex('Tagus Clearing Agents Lda', {
        method: 'Labelled field',
        confidence: 0.95,
        snippet: 'Notify party\nTagus Clearing Agents Lda',
        region: R('BL', 'notifyParty'),
      }),
      'Match',
    ),
    row(
      'portOfLoading',
      ex('Penang', {
        method: 'Labelled field',
        confidence: 0.98,
        snippet: 'Port of loading\nPenang',
        region: R('SI', 'portOfLoading'),
      }),
      ex('Penang', {
        method: 'Labelled field',
        confidence: 0.98,
        snippet: 'Port of loading\nPenang',
        region: R('BL', 'portOfLoading'),
      }),
      'Match',
    ),
    row(
      'portOfDischarge',
      ex('Lisbon', {
        method: 'Labelled field',
        confidence: 0.97,
        snippet: 'Port of discharge\nLisbon',
        region: R('SI', 'portOfDischarge'),
      }),
      ex('Lisbon', {
        method: 'Labelled field',
        confidence: 0.97,
        snippet: 'Discharge port\nLisbon',
        region: R('BL', 'portOfDischarge'),
      }),
      'Match',
    ),
    row(
      'containerCount',
      ex('4', {
        method: 'Table cell',
        confidence: 0.96,
        snippet: 'Containers  4',
        region: R('SI', 'containerCount'),
      }),
      ex('4', {
        method: 'Table cell',
        confidence: 0.96,
        snippet: 'No. of pkgs  4',
        region: R('BL', 'containerCount'),
      }),
      'Match',
    ),
    row(
      'grossWeightKg',
      ex('26700', {
        raw: '26,700',
        method: 'Table cell',
        confidence: 0.97,
        snippet: 'Gross weight kg  26,700',
        region: R('SI', 'grossWeightKg'),
      }),
      ex('26700', {
        raw: '26,700',
        method: 'Table cell',
        confidence: 0.97,
        snippet: 'Gross weight KGS  26,700',
        region: R('BL', 'grossWeightKg'),
      }),
      'Match',
      { normalizationNote: 'Matched after normalization: thousands separator removed.' },
    ),
  ],
  timeline: timeline([
    ['ReceiveEmail', 'Done', '2026-09-21 07:05:02', 'Message accepted into batch B-2026-09-21-A.', 170],
    ['ClassifyEmail', 'Done', '2026-09-21 07:05:08', 'Document comparison request, confidence 0.95.', 1350],
    ['FetchAttachments', 'Done', '2026-09-21 07:05:14', '2 files fetched, 286 KB total.', 2700],
    ['ReadDocuments', 'Done', '2026-09-21 07:05:29', 'Word file read as text. Text layer present in the PDF.', 14200],
    ['ExtractFields', 'Done', '2026-09-21 07:16:40', '13 of 14 values found, 1 field has two candidates.', 27600],
    ['CompareFields', 'Done', '2026-09-21 07:17:44', '6 fields match, 1 field needs review.', 2300],
    ['PublishResult', 'Waiting', '2026-09-21 07:18:02', 'Held until 1 review task is resolved.'],
  ]),
  reviewHistory: [],
};

const E1053: EmailCase = {
  id: 'E-1053',
  subject: 'SI and draft BL for booking 88196',
  sender: 'export@sungaiemasrubber.example',
  senderName: 'Lim Wei Jian, Sungai Emas Rubber',
  receivedAt: '2026-09-19 09:30',
  updatedAt: '2026-09-19 09:33',
  category: 'Document comparison request',
  categoryConfidence: 0.97,
  categoryReason: 'The subject names both documents for one booking and both were attached.',
  status: 'Completed',
  result: 'No mismatch detected',
  batchId: 'B-2026-09-19-C',
  sourceQuality: 'Text PDF',
  body: `Please check the attached SI against the carrier draft for booking 88196.

Regards,
Lim Wei Jian
Sungai Emas Rubber Sdn Bhd`,
  attachments: [
    {
      id: 'doc-1053-si',
      filename: 'SI-88196.pdf',
      kind: 'SI',
      sizeLabel: '172 KB',
      fileType: 'PDF',
      linkExpiresIn: '14 minutes',
      pageCount: 1,
    },
    {
      id: 'doc-1053-bl',
      filename: 'DRAFT-BL-88196.pdf',
      kind: 'BL',
      sizeLabel: '232 KB',
      fileType: 'PDF',
      linkExpiresIn: '14 minutes',
      pageCount: 2,
    },
  ],
  comparison: [
    row(
      'shipper',
      ex('Sungai Emas Rubber Sdn Bhd', {
        method: 'Labelled field',
        confidence: 0.98,
        snippet: 'Shipper\nSungai Emas Rubber Sdn Bhd',
        region: R('SI', 'shipper'),
      }),
      ex('Sungai Emas Rubber Sdn Bhd', {
        method: 'Labelled field',
        confidence: 0.98,
        snippet: 'Shipper / Exporter\nSungai Emas Rubber Sdn Bhd',
        region: R('BL', 'shipper'),
      }),
      'Match',
    ),
    row(
      'consignee',
      ex('Baltic Tyre Works AS', {
        method: 'Labelled field',
        confidence: 0.98,
        snippet: 'Consignee\nBaltic Tyre Works AS',
        region: R('SI', 'consignee'),
      }),
      ex('Baltic Tyre Works AS', {
        method: 'Labelled field',
        confidence: 0.98,
        snippet: 'Consignee (complete name and address)\nBaltic Tyre Works AS',
        region: R('BL', 'consignee'),
      }),
      'Match',
    ),
    row(
      'notifyParty',
      ex('Baltic Tyre Works AS', {
        method: 'Labelled field',
        confidence: 0.97,
        snippet: 'Notify party\nBaltic Tyre Works AS',
        region: R('SI', 'notifyParty'),
      }),
      ex('Baltic Tyre Works AS', {
        method: 'Labelled field',
        confidence: 0.97,
        snippet: 'Notify party\nBaltic Tyre Works AS',
        region: R('BL', 'notifyParty'),
      }),
      'Match',
    ),
    row(
      'portOfLoading',
      ex('Port Klang', {
        method: 'Labelled field',
        confidence: 0.99,
        snippet: 'Port of loading\nPort Klang',
        region: R('SI', 'portOfLoading'),
      }),
      ex('Port Klang', {
        method: 'Labelled field',
        confidence: 0.99,
        snippet: 'Port of loading\nPort Klang',
        region: R('BL', 'portOfLoading'),
      }),
      'Match',
    ),
    row(
      'portOfDischarge',
      ex('Hamburg', {
        method: 'Labelled field',
        confidence: 0.98,
        snippet: 'Port of discharge\nHamburg',
        region: R('SI', 'portOfDischarge'),
      }),
      ex('Hamburg', {
        method: 'Labelled field',
        confidence: 0.98,
        snippet: 'Discharge port\nHamburg',
        region: R('BL', 'portOfDischarge'),
      }),
      'Match',
    ),
    row(
      'containerCount',
      ex('3', {
        method: 'Table cell',
        confidence: 0.97,
        snippet: 'Containers  3',
        region: R('SI', 'containerCount'),
      }),
      ex('3', {
        method: 'Table cell',
        confidence: 0.97,
        snippet: 'No. of pkgs  3',
        region: R('BL', 'containerCount'),
      }),
      'Match',
    ),
    row(
      'grossWeightKg',
      ex('19950', {
        raw: '19,950',
        method: 'Table cell',
        confidence: 0.98,
        snippet: 'Gross weight kg  19,950',
        region: R('SI', 'grossWeightKg'),
      }),
      ex('19950', {
        raw: '19,950 KGS',
        method: 'Table cell',
        confidence: 0.97,
        snippet: 'Gross weight KGS  19,950 KGS',
        region: R('BL', 'grossWeightKg'),
        normalizedFrom: '19,950 KGS',
      }),
      'Match',
      { normalizationNote: 'Matched after normalization: thousands separator and the unit "KGS" removed.' },
    ),
  ],
  timeline: timeline([
    ['ReceiveEmail', 'Done', '2026-09-19 09:30:04', 'Message accepted into batch B-2026-09-19-C.', 160],
    ['ClassifyEmail', 'Done', '2026-09-19 09:30:10', 'Document comparison request, confidence 0.97.', 1300],
    ['FetchAttachments', 'Done', '2026-09-19 09:30:16', '2 files fetched, 404 KB total.', 2800],
    ['ReadDocuments', 'Done', '2026-09-19 09:30:32', 'Text layer present in both files, no OCR needed.', 15100],
    ['ExtractFields', 'Done', '2026-09-19 09:32:04', '14 of 14 values found, lowest confidence 0.97.', 28100],
    ['CompareFields', 'Done', '2026-09-19 09:32:51', '7 fields match, 1 matched after normalization.', 2000],
    ['PublishResult', 'Done', '2026-09-19 09:33:12', 'Result published: No mismatch detected.', 680],
  ]),
  reviewHistory: [],
};

const E1054: EmailCase = {
  id: 'E-1054',
  subject: 'Draft BL booking 88196 revision 2, discharge port changed',
  sender: 'docs@havenportlines.example',
  senderName: 'Carrier documentation, Havenport Lines',
  receivedAt: '2026-09-19 14:02',
  updatedAt: '2026-09-19 14:06',
  category: 'Document comparison request',
  categoryConfidence: 0.96,
  categoryReason: 'The subject names a revised draft bill of lading and both documents were attached.',
  status: 'Completed',
  result: 'Mismatch found',
  batchId: 'B-2026-09-19-C',
  sourceQuality: 'Text PDF',
  body: `Revision 2 of the draft bill of lading for booking 88196 is attached.

The discharge port has been changed at the request of the terminal. Please confirm whether the shipping instruction should be amended to match.

Havenport Lines, Documentation`,
  attachments: [
    {
      id: 'doc-1053-si',
      filename: 'SI-88196.pdf',
      kind: 'SI',
      sizeLabel: '172 KB',
      fileType: 'PDF',
      linkExpiresIn: '14 minutes',
      pageCount: 1,
    },
    {
      id: 'doc-1053-bl',
      filename: 'DRAFT-BL-88196-R2.pdf',
      kind: 'BL',
      sizeLabel: '234 KB',
      fileType: 'PDF',
      linkExpiresIn: '14 minutes',
      pageCount: 2,
    },
  ],
  comparison: [
    ...E1053.comparison.slice(0, 4),
    row(
      'portOfDischarge',
      ex('Hamburg', {
        method: 'Labelled field',
        confidence: 0.98,
        snippet: 'Port of discharge\nHamburg',
        region: R('SI', 'portOfDischarge'),
      }),
      ex('Bremerhaven', {
        method: 'Labelled field',
        confidence: 0.98,
        snippet: 'Discharge port\nBremerhaven',
        region: R('BL', 'portOfDischarge'),
      }),
      'Mismatch',
    ),
    ...E1053.comparison.slice(5),
  ],
  timeline: timeline([
    ['ReceiveEmail', 'Done', '2026-09-19 14:02:03', 'Message accepted into batch B-2026-09-19-C.', 160],
    ['ClassifyEmail', 'Done', '2026-09-19 14:02:09', 'Document comparison request, confidence 0.96.', 1290],
    ['FetchAttachments', 'Done', '2026-09-19 14:02:15', '2 files fetched, 406 KB total.', 2900],
    ['ReadDocuments', 'Done', '2026-09-19 14:02:31', 'Text layer present in both files, no OCR needed.', 15400],
    ['ExtractFields', 'Done', '2026-09-19 14:04:52', '14 of 14 values found, lowest confidence 0.97.', 27900],
    ['CompareFields', 'Done', '2026-09-19 14:05:40', '6 fields match, 1 field differs.', 2100],
    ['PublishResult', 'Done', '2026-09-19 14:06:08', 'Result published: Mismatch found.', 690],
  ]),
  reviewHistory: [
    {
      id: 'rh-1054-1',
      at: '2026-09-19 14:05:12',
      actor: 'Priya Raman',
      field: 'portOfDischarge',
      action: 'Confirmed',
      to: 'Bremerhaven',
      note: 'Terminal change confirmed by the carrier on the phone. The shipping instruction still says Hamburg, so this is a real difference.',
    },
  ],
};

export const SEED_CASES: EmailCase[] = [
  E1042,
  E1043,
  E1044,
  E1045,
  E1046,
  E1047,
  E1048,
  E1049,
  E1050,
  E1051,
  E1052,
  E1053,
  E1054,
];

/* ============================================================
   Review tasks
   ============================================================ */

export const SEED_TASKS: ReviewTask[] = [
  {
    id: 'T-2051',
    caseId: 'E-1044',
    subject: E1044.subject,
    reasonCodes: ['LOW_CONFIDENCE_OCR', 'TWO_CANDIDATES', 'AMBIGUOUS_LABEL'],
    createdAt: '2026-09-21 06:45',
    ageLabel: '2h 31m',
    ageMinutes: 151,
    claimState: 'Open',
    dueInLabel: '1h 29m',
    questions: [
      {
        id: 'q-1044-weight',
        field: 'grossWeightKg',
        reasonCodes: ['LOW_CONFIDENCE_OCR', 'TWO_CANDIDATES'],
        siValue: '21,850 kg',
        blValue: '27,850 kg',
        proposedValue: '27,850',
        confidence: 0.54,
        method: 'OCR',
        snippet: 'Total as per carrier tally\nGross weight KGS  27,850',
        doc: 'BL',
        region: R('BL', 'grossWeightKg'),
        candidates: [
          {
            id: 'c-weight-a',
            value: '27,850',
            doc: 'BL',
            page: 1,
            snippet: 'Gross weight KGS  27,850',
            confidence: 0.54,
            region: R('BL', 'grossWeightKg'),
            sourceLabel: 'Draft BL, page 1, carrier tally row',
          },
          {
            id: 'c-weight-b',
            value: '21,850',
            doc: 'SI',
            page: 1,
            snippet: 'Gross weight kg  21,850',
            confidence: 0.92,
            region: R('SI', 'grossWeightKg'),
            sourceLabel: 'Shipping instruction, page 1, totals row',
          },
        ],
      },
      {
        id: 'q-1044-notify',
        field: 'notifyParty',
        reasonCodes: ['AMBIGUOUS_LABEL'],
        siValue: 'Zadar Customs Broker d.o.o.',
        blValue: 'Zadar Customs Broker d.o.o.',
        proposedValue: 'Zadar Customs Broker d.o.o.',
        confidence: 0.58,
        method: 'OCR',
        snippet: 'Notify party\nZadar Customs Broker d.o.o.\nObala Kralja Petra 4',
        doc: 'BL',
        region: R('BL', 'notifyParty'),
      },
      {
        id: 'q-1044-consignee',
        field: 'consignee',
        reasonCodes: ['LOW_CONFIDENCE_OCR'],
        siValue: 'Adriatic Panel Works d.o.o.',
        blValue: 'Adriatic Panel Works d.o.o.',
        proposedValue: 'Adriatic Panel Works d.o.o.',
        confidence: 0.62,
        method: 'OCR',
        snippet: 'Consignee (complete name and address)\nAdriatic Panel Works d.o.o.\nIndustrijska cesta 22',
        doc: 'BL',
        region: R('BL', 'consignee'),
      },
    ],
  },
  {
    id: 'T-2052',
    caseId: 'E-1045',
    subject: E1045.subject,
    reasonCodes: ['MISSING_ATTACHMENT'],
    createdAt: '2026-09-21 05:03',
    ageLabel: '4h 13m',
    ageMinutes: 253,
    claimState: 'Open',
    dueInLabel: 'Due now',
    questions: [
      {
        id: 'q-1045-category',
        field: 'category',
        reasonCodes: ['MISSING_ATTACHMENT'],
        siValue: null,
        blValue: null,
        proposedValue: 'Document comparison request',
        confidence: 0.72,
        method: 'Not found',
        snippet:
          'Can you check the documents for the Lisbon shipment and confirm the consignee is right before the carrier issues the original?',
        doc: 'SI',
      },
    ],
  },
  {
    id: 'T-2053',
    caseId: 'E-1052',
    subject: E1052.subject,
    reasonCodes: ['TWO_CANDIDATES'],
    createdAt: '2026-09-21 07:18',
    ageLabel: '1h 58m',
    ageMinutes: 118,
    claimState: 'Claimed',
    claimedBy: { name: 'Priya Raman', initials: 'PR' },
    dueInLabel: '2h 02m',
    questions: [
      {
        id: 'q-1052-consignee',
        field: 'consignee',
        reasonCodes: ['TWO_CANDIDATES'],
        siValue: 'Lisbon Stone Importers Lda',
        blValue: null,
        proposedValue: null,
        confidence: 0.49,
        method: 'Labelled field',
        snippet:
          'Consignee (complete name and address)\nLisbon Stone Importers Lda\n… goods description also reads: Tagus Clearing Agents Lda as consignee of record',
        doc: 'BL',
        region: R('BL', 'consignee'),
        candidates: [
          {
            id: 'c-1052-a',
            value: 'Lisbon Stone Importers Lda',
            doc: 'BL',
            page: 1,
            snippet: 'Consignee (complete name and address)\nLisbon Stone Importers Lda\nRua do Alecrim 44',
            confidence: 0.86,
            region: R('BL', 'consignee'),
            sourceLabel: 'Draft BL, page 1, consignee box',
          },
          {
            id: 'c-1052-b',
            value: 'Tagus Clearing Agents Lda',
            doc: 'BL',
            page: 1,
            snippet: 'Description\nGranite slabs, crated. Tagus Clearing Agents Lda as consignee of record.',
            confidence: 0.51,
            region: { page: 1, x: 180, y: 490, w: 114, h: 34 },
            sourceLabel: 'Draft BL, page 1, goods description',
          },
        ],
      },
    ],
  },
  {
    id: 'T-2054',
    caseId: 'E-1050',
    subject: E1050.subject,
    reasonCodes: ['UNKNOWN_PORT_ALIAS'],
    createdAt: '2026-09-20 06:02',
    ageLabel: '27h 14m',
    ageMinutes: 1634,
    claimState: 'Overdue',
    dueInLabel: 'Overdue by 24h 14m',
    questions: [
      {
        id: 'q-1050-pod',
        field: 'portOfDischarge',
        reasonCodes: ['UNKNOWN_PORT_ALIAS'],
        siValue: 'Jebel Ali',
        blValue: 'JEA',
        proposedValue: 'Jebel Ali',
        confidence: 0.45,
        method: 'Labelled field',
        snippet: 'Discharge port\nJEA',
        doc: 'BL',
        region: R('BL', 'portOfDischarge'),
        candidates: [
          {
            id: 'c-1050-a',
            value: 'Jebel Ali',
            doc: 'SI',
            page: 1,
            snippet: 'Port of discharge\nJebel Ali',
            confidence: 0.97,
            region: R('SI', 'portOfDischarge'),
            sourceLabel: 'Shipping instruction, page 1, port of discharge box',
          },
          {
            id: 'c-1050-b',
            value: 'JEA',
            doc: 'BL',
            page: 1,
            snippet: 'Discharge port\nJEA',
            confidence: 0.45,
            region: R('BL', 'portOfDischarge'),
            sourceLabel: 'Draft BL, page 1, discharge port box',
          },
        ],
      },
    ],
  },
  {
    id: 'T-2055',
    caseId: 'E-1049',
    subject: E1049.subject,
    reasonCodes: ['CATEGORY_UNCERTAIN'],
    createdAt: '2026-09-20 16:24',
    ageLabel: '16h 52m',
    ageMinutes: 1012,
    claimState: 'Open',
    dueInLabel: 'Due in 7h 08m',
    questions: [
      {
        id: 'q-1049-category',
        field: 'category',
        reasonCodes: ['CATEGORY_UNCERTAIN'],
        siValue: null,
        blValue: null,
        proposedValue: 'General message',
        confidence: 0.68,
        method: 'Not found',
        snippet:
          'From 1 October our documentation mailbox changes to import-docs@northwindcommodities.example. … For booking 88155 currently in progress, please continue to use the existing address.',
        doc: 'SI',
      },
    ],
  },
];

/* ============================================================
   Import batches
   ============================================================ */

export const SEED_BATCHES: ImportBatch[] = [
  {
    id: 'B-2026-09-21-A',
    label: 'Morning inbox sweep',
    startedAt: '2026-09-21 03:00',
    finishedAt: null,
    expected: 40,
    received: 31,
    accepted: 28,
    rejected: 3,
    state: 'Running',
    deadLetterCount: 2,
    deadLetterNote:
      '2 emails could not arrive after 5 attempts each. They are held for 14 days and can be tried again from here.',
    rejectedRecords: [
      {
        id: 'rr-1',
        messageId: 'M-88214-a1',
        subject: 'Fwd: Fwd: Fwd: documents',
        reason: 'The message exceeds the 25 MB size limit for this inbox.',
        code: 'SIZE_LIMIT',
        at: '2026-09-21 06:12',
      },
      {
        id: 'rr-2',
        messageId: 'M-88214-b7',
        subject: '(no subject)',
        reason: 'The sender address could not be parsed, so the message cannot be attributed.',
        code: 'BAD_SENDER',
        at: '2026-09-21 06:48',
      },
      {
        id: 'rr-3',
        messageId: 'M-88214-c2',
        subject: 'Check BL',
        reason: 'The attachment is password protected and cannot be read.',
        code: 'ENCRYPTED_ATTACHMENT',
        at: '2026-09-21 07:31',
      },
    ],
  },
  {
    id: 'B-2026-09-20-B',
    label: 'Evening inbox sweep',
    startedAt: '2026-09-20 15:00',
    finishedAt: '2026-09-20 17:42',
    expected: 120,
    received: 120,
    accepted: 116,
    rejected: 4,
    state: 'Complete with rejects',
    deadLetterCount: 1,
    deadLetterNote: '1 email could not arrive after 5 attempts.',
    rejectedRecords: [
      {
        id: 'rr-4',
        messageId: 'M-88190-d4',
        subject: 'RE: draft',
        reason: 'The attachment is a zip file, which this inbox does not open.',
        code: 'UNSUPPORTED_TYPE',
        at: '2026-09-20 15:22',
      },
      {
        id: 'rr-5',
        messageId: 'M-88190-e9',
        subject: 'Scanned document',
        reason: 'The PDF has no readable page data.',
        code: 'DOC_READ_FAILED',
        at: '2026-09-20 15:58',
      },
      {
        id: 'rr-6',
        messageId: 'M-88190-f1',
        subject: 'Automatic reply: out of office',
        reason: 'The message is an automatic reply and carries no request.',
        code: 'AUTO_REPLY',
        at: '2026-09-20 16:40',
      },
      {
        id: 'rr-7',
        messageId: 'M-88190-g6',
        subject: 'Delivery Status Notification (Failure)',
        reason: 'The message is a bounce notice from the mail server.',
        code: 'BOUNCE',
        at: '2026-09-20 17:05',
      },
    ],
  },
  {
    id: 'B-2026-09-20-A',
    label: 'Morning inbox sweep',
    startedAt: '2026-09-20 03:00',
    finishedAt: '2026-09-20 05:11',
    expected: 96,
    received: 96,
    accepted: 96,
    rejected: 0,
    state: 'Complete',
    deadLetterCount: 0,
    rejectedRecords: [],
  },
  {
    id: 'B-2026-09-19-C',
    label: 'Backfill from archive',
    startedAt: '2026-09-19 08:30',
    finishedAt: null,
    expected: 60,
    received: 18,
    accepted: 17,
    rejected: 1,
    state: 'Stalled',
    deadLetterCount: 4,
    deadLetterNote:
      '4 emails could not arrive. The archive connection stopped responding at 09:41 and this import has not moved since.',
    rejectedRecords: [
      {
        id: 'rr-8',
        messageId: 'M-88166-h3',
        subject: 'Archive export 2024',
        reason: 'The message has no recipient in this inbox.',
        code: 'NO_RECIPIENT',
        at: '2026-09-19 09:02',
      },
    ],
  },
];

/* ============================================================
   Exports
   ============================================================ */

export const SEED_EXPORTS: ExportRecord[] = [
  {
    id: 'X-0043',
    createdAt: '2026-09-20 18:04',
    createdBy: 'Mei Ling Tan',
    format: 'Submission JSON',
    caseCount: 116,
    pendingReviewCount: 0,
    score: '0.942',
    notes:
      'Two disagreements with the reference set, both on notify party where the reference kept the care-of line and we dropped it.',
    filename: 'tidemark-submission-2026-09-20.json',
  },
  {
    id: 'X-0042',
    createdAt: '2026-09-20 09:15',
    createdBy: 'Aisyah Rahman',
    format: 'CSV',
    caseCount: 96,
    pendingReviewCount: 2,
    score: '0.917',
    notes: 'Exported with 2 cases still waiting for review, so those rows carry Needs review.',
    filename: 'tidemark-cases-2026-09-20.csv',
  },
  {
    id: 'X-0041',
    createdAt: '2026-09-19 17:48',
    createdBy: 'Mei Ling Tan',
    format: 'Submission JSON',
    caseCount: 61,
    pendingReviewCount: 0,
    score: '0.889',
    notes:
      'Port alias list was short at this point, which cost us four port of discharge rows. Aliases added afterwards.',
    filename: 'tidemark-submission-2026-09-19.json',
  },
];

/* ============================================================
   Configuration
   ============================================================ */

export const SEED_THRESHOLDS: ConfigThresholds = {
  acceptConfidence: 0.9,
  reviewConfidence: 0.7,
  weightTolerancePct: 0.5,
  containerCountTolerance: 0,
  ocrMinConfidence: 0.6,
  categoryMinConfidence: 0.75,
};

export const SEED_SYNONYMS: SynonymRow[] = [
  { id: 'sy-1', field: 'shipper', label: 'Shipper / Exporter' },
  { id: 'sy-2', field: 'shipper', label: 'Consignor' },
  { id: 'sy-3', field: 'consignee', label: 'Consignee (complete name and address)' },
  { id: 'sy-4', field: 'consignee', label: 'Buyer / Consignee' },
  { id: 'sy-5', field: 'notifyParty', label: 'Also notify' },
  { id: 'sy-6', field: 'notifyParty', label: 'Notify address' },
  { id: 'sy-7', field: 'portOfLoading', label: 'Load port' },
  { id: 'sy-8', field: 'portOfLoading', label: 'POL' },
  { id: 'sy-9', field: 'portOfDischarge', label: 'Discharge port' },
  { id: 'sy-10', field: 'portOfDischarge', label: 'POD' },
  { id: 'sy-11', field: 'containerCount', label: 'No. of pkgs' },
  { id: 'sy-12', field: 'containerCount', label: 'Total containers' },
  { id: 'sy-13', field: 'grossWeightKg', label: 'Gross weight KGS' },
  { id: 'sy-14', field: 'grossWeightKg', label: 'Gross wt (kg)' },
];

export const SEED_PORT_ALIASES: PortAliasRow[] = [
  { id: 'pa-1', alias: 'PORT KLANG, MALAYSIA', canonical: 'Port Klang', unlocode: 'MYPKG' },
  { id: 'pa-2', alias: 'Northport', canonical: 'Port Klang', unlocode: 'MYPKG' },
  { id: 'pa-3', alias: 'Westport', canonical: 'Port Klang', unlocode: 'MYPKG' },
  { id: 'pa-4', alias: 'ROTTERDAM, NL', canonical: 'Rotterdam', unlocode: 'NLRTM' },
  { id: 'pa-5', alias: 'Antwerpen', canonical: 'Antwerp', unlocode: 'BEANR' },
  { id: 'pa-6', alias: 'Koper, SI', canonical: 'Koper', unlocode: 'SIKOP' },
  { id: 'pa-7', alias: 'Penang Port', canonical: 'Penang', unlocode: 'MYPEN' },
  { id: 'pa-8', alias: 'Kuantan Port', canonical: 'Kuantan', unlocode: 'MYKUA' },
];

export const SEED_SUFFIXES: SuffixRow[] = [
  { id: 'sf-1', suffix: 'Sdn Bhd', note: 'Also matches SDN. BHD., Sdn. Bhd. and SDN BHD.' },
  { id: 'sf-2', suffix: 'Bhd', note: 'Also matches BHD. and Berhad.' },
  { id: 'sf-3', suffix: 'GmbH', note: 'Also matches G.m.b.H.' },
  { id: 'sf-4', suffix: 'BV', note: 'Also matches B.V. and Besloten Vennootschap.' },
  { id: 'sf-5', suffix: 'LLC', note: 'Also matches L.L.C.' },
  { id: 'sf-6', suffix: 'd.o.o.', note: 'Also matches DOO and d.o.o' },
  { id: 'sf-7', suffix: 'Lda', note: 'Also matches LDA. and Limitada.' },
  { id: 'sf-8', suffix: 'AS', note: 'Also matches A/S and A.S.' },
];

export const SEED_MAPPING: MappingRow[] = [
  { id: 'mp-1', field: 'caseId', exportColumn: 'email_id', required: true },
  { id: 'mp-2', field: 'result', exportColumn: 'case_result', required: true },
  { id: 'mp-3', field: 'shipper', exportColumn: 'shipper_name', required: true },
  { id: 'mp-4', field: 'consignee', exportColumn: 'consignee_name', required: true },
  { id: 'mp-5', field: 'notifyParty', exportColumn: 'notify_party_name', required: false },
  { id: 'mp-6', field: 'portOfLoading', exportColumn: 'pol', required: true },
  { id: 'mp-7', field: 'portOfDischarge', exportColumn: 'pod', required: true },
  { id: 'mp-8', field: 'containerCount', exportColumn: 'container_count', required: true },
  { id: 'mp-9', field: 'grossWeightKg', exportColumn: 'gross_weight_kg', required: true },
];

/* ============================================================
   Audit log
   ============================================================ */

export const SEED_AUDIT: AuditEntry[] = [
  {
    id: 'a-1',
    at: '2026-09-21 08:14:02',
    actor: 'system',
    actorRole: 'Admin',
    action: 'Result published',
    target: 'E-1042',
    ip: '10.20.4.11',
    detail: {
      Result: 'Mismatch found',
      'Fields compared': '7',
      'Fields differing': 'Container count',
      Duration: '1 m 58 s',
    },
  },
  {
    id: 'a-2',
    at: '2026-09-21 07:52:10',
    actor: 'Priya Raman',
    actorRole: 'Reviewer',
    action: 'Task claimed',
    target: 'T-2053',
    ip: '203.0.113.42',
    detail: { Case: 'E-1052', 'Reason code': 'TWO_CANDIDATES', 'Claim expires': '2026-09-21 09:52' },
  },
  {
    id: 'a-3',
    at: '2026-09-21 07:31:44',
    actor: 'system',
    actorRole: 'Admin',
    action: 'Record rejected',
    target: 'B-2026-09-21-A',
    ip: '10.20.4.11',
    detail: {
      'Message id': 'M-88214-c2',
      Code: 'ENCRYPTED_ATTACHMENT',
      Reason: 'The attachment is password protected and cannot be read.',
    },
  },
  {
    id: 'a-4',
    at: '2026-09-21 06:45:01',
    actor: 'system',
    actorRole: 'Admin',
    action: 'Review task created',
    target: 'T-2051',
    ip: '10.20.4.11',
    detail: {
      Case: 'E-1044',
      'Reason codes': 'LOW_CONFIDENCE_OCR, TWO_CANDIDATES, AMBIGUOUS_LABEL',
      Fields: 'Gross weight (kg), Notify party, Consignee',
    },
  },
  {
    id: 'a-5',
    at: '2026-09-21 04:02:18',
    actor: 'Mei Ling Tan',
    actorRole: 'Operator',
    action: 'Case retried',
    target: 'E-1047',
    ip: '203.0.113.19',
    detail: { 'From step': 'ReadDocuments', Attempt: '3', Outcome: 'Failed again with DOC_READ_FAILED' },
  },
  {
    id: 'a-6',
    at: '2026-09-20 18:04:52',
    actor: 'Mei Ling Tan',
    actorRole: 'Operator',
    action: 'Export generated',
    target: 'X-0043',
    ip: '203.0.113.19',
    detail: {
      Format: 'Submission JSON',
      Cases: '116',
      'Waiting for review': '0',
      File: 'tidemark-submission-2026-09-20.json',
    },
  },
  {
    id: 'a-7',
    at: '2026-09-20 14:22:07',
    actor: 'Aisyah Rahman',
    actorRole: 'Admin',
    action: 'Configuration changed',
    target: 'Confidence thresholds',
    ip: '198.51.100.7',
    detail: { Setting: 'reviewConfidence', From: '0.65', To: '0.70', Reason: 'Too many low quality scans passing.' },
  },
  {
    id: 'a-8',
    at: '2026-09-20 14:18:31',
    actor: 'Aisyah Rahman',
    actorRole: 'Admin',
    action: 'Port alias added',
    target: 'Port aliases',
    ip: '198.51.100.7',
    detail: { Alias: 'PORT KLANG, MALAYSIA', Canonical: 'Port Klang', UN_LOCODE: 'MYPKG' },
  },
  {
    id: 'a-9',
    at: '2026-09-19 14:05:12',
    actor: 'Priya Raman',
    actorRole: 'Reviewer',
    action: 'Decision saved',
    target: 'E-1054',
    ip: '203.0.113.42',
    detail: {
      Field: 'Port of discharge',
      Decision: 'Confirmed',
      Value: 'Bremerhaven',
      Note: 'Terminal change confirmed by the carrier on the phone.',
    },
  },
  {
    id: 'a-10',
    at: '2026-09-19 09:41:03',
    actor: 'system',
    actorRole: 'Admin',
    action: 'Batch stalled',
    target: 'B-2026-09-19-C',
    ip: '10.20.4.11',
    detail: {
      Received: '18 of 60',
      Cause: 'The archive connector stopped responding.',
      'Next action': 'Reprocess the batch once the connector is back.',
    },
  },
  {
    id: 'a-11',
    at: '2026-09-19 08:30:00',
    actor: 'Aisyah Rahman',
    actorRole: 'Admin',
    action: 'Batch started',
    target: 'B-2026-09-19-C',
    ip: '198.51.100.7',
    detail: { Source: 'Archive connector', Expected: '60', Label: 'Backfill from archive' },
  },
  {
    id: 'a-12',
    at: '2026-09-18 11:07:40',
    actor: 'Aisyah Rahman',
    actorRole: 'Admin',
    action: 'User role changed',
    target: 'Daniel Okonjo',
    ip: '198.51.100.7',
    detail: { From: 'Operator', To: 'Reviewer', Reason: 'Joined the documentation review rota.' },
  },
];

/* ---------- helpers used by screens ---------- */

export const RESULT_ORDER: CaseResult[] = [
  'No mismatch detected',
  'Mismatch found',
  'Needs review',
  'Not applicable',
  'Awaiting documents',
  'Failed',
];
