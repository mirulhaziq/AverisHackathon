/* ============================================================
   Document facsimiles.

   Each document is a list of drawing elements in a fixed page
   coordinate space (PAGE_W x PAGE_H). The evidence viewer renders
   them as HTML and draws highlight boxes in the same space, so a
   highlight always lands exactly on the text it refers to.
   ============================================================ */

import type { DocKind, FieldKey, Region } from '../types';

export const PAGE_W = 640;
export const PAGE_H = 900;

export type DocElement =
  | { t: 'box'; x: number; y: number; w: number; h: number; fill?: boolean }
  | { t: 'rule'; x: number; y: number; w: number }
  | { t: 'vrule'; x: number; y: number; h: number }
  | { t: 'title'; x: number; y: number; text: string; size?: number }
  | { t: 'label'; x: number; y: number; text: string }
  | {
      t: 'value';
      x: number;
      y: number;
      text: string;
      field?: FieldKey;
      size?: number;
      bold?: boolean;
      mono?: boolean;
      w?: number;
      /** marks text that the reader had trouble with, rendered smudged */
      degraded?: boolean;
    }
  | { t: 'note'; x: number; y: number; w: number; text: string }
  | { t: 'stamp'; x: number; y: number; text: string; angle?: number };

export interface DocPage {
  elements: DocElement[];
}

export interface DocumentFacsimile {
  id: string;
  kind: DocKind;
  filename: string;
  /** 'text' renders crisply, 'scan' adds scan artefacts. */
  render: 'text' | 'scan';
  pages: DocPage[];
  /** Highlight rectangles keyed by field. */
  regions: Partial<Record<FieldKey, Region>>;
}

export interface DocValues {
  shipper: string[];
  consignee: string[];
  notifyParty: string[];
  portOfLoading: string;
  portOfDischarge: string;
  containerCount: string;
  grossWeightKg: string;
  reference: string;
  booking: string;
  date: string;
  vessel: string;
  voyage: string;
  goods: string;
  marks: string;
  measurement: string;
  containerNos: string[];
  /** Overrides for the labels a BL prints, used for alias demos. */
  polLabel?: string;
  podLabel?: string;
  /** Render this value as hard to read. */
  degradedField?: FieldKey;
}

/* ---------- shared region table -------------------------------
   Positions are fixed by the templates below, so a region can be
   looked up without measuring rendered text.
   ------------------------------------------------------------- */

const SI_REGIONS: Record<FieldKey, Region> = {
  shipper: { page: 1, x: 38, y: 112, w: 300, h: 19 },
  consignee: { page: 1, x: 38, y: 174, w: 316, h: 19 },
  notifyParty: { page: 1, x: 38, y: 236, w: 316, h: 19 },
  portOfLoading: { page: 1, x: 38, y: 340, w: 232, h: 19 },
  portOfDischarge: { page: 1, x: 322, y: 340, w: 232, h: 19 },
  containerCount: { page: 1, x: 366, y: 556, w: 62, h: 19 },
  grossWeightKg: { page: 1, x: 446, y: 556, w: 88, h: 19 },
};

const BL_REGIONS: Record<FieldKey, Region> = {
  shipper: { page: 1, x: 38, y: 136, w: 300, h: 19 },
  consignee: { page: 1, x: 38, y: 202, w: 316, h: 19 },
  notifyParty: { page: 1, x: 38, y: 268, w: 316, h: 19 },
  portOfLoading: { page: 1, x: 38, y: 374, w: 240, h: 19 },
  portOfDischarge: { page: 1, x: 322, y: 374, w: 240, h: 19 },
  containerCount: { page: 1, x: 300, y: 564, w: 74, h: 19 },
  grossWeightKg: { page: 1, x: 404, y: 564, w: 96, h: 19 },
};

export function regionFor(doc: DocKind, field: FieldKey): Region {
  return doc === 'SI' ? SI_REGIONS[field] : BL_REGIONS[field];
}

/** A region nudged to a second page position, for multi-page docs. */
export function onPage(region: Region, page: number): Region {
  return { ...region, page };
}

/* ---------- Shipping Instruction template ---------- */

function siPage(v: DocValues): DocPage {
  const deg = (f: FieldKey) => (v.degradedField === f ? true : undefined);
  const e: DocElement[] = [
    { t: 'title', x: 36, y: 46, text: 'SHIPPING INSTRUCTION', size: 15 },
    { t: 'label', x: 36, y: 62, text: 'Meridian Freight Lines Sdn Bhd — Documentation Desk' },
    { t: 'label', x: 404, y: 40, text: 'SI reference' },
    { t: 'value', x: 404, y: 56, text: v.reference, mono: true, size: 11 },
    { t: 'label', x: 404, y: 70, text: 'Booking no.' },
    { t: 'value', x: 404, y: 86, text: v.booking, mono: true, size: 11 },
    { t: 'label', x: 528, y: 70, text: 'Date' },
    { t: 'value', x: 528, y: 86, text: v.date, size: 11 },
    { t: 'rule', x: 36, y: 76, w: 340 },

    // Shipper
    { t: 'box', x: 36, y: 90, w: 568, h: 62 },
    { t: 'label', x: 42, y: 104, text: 'Shipper' },
    { t: 'value', x: 42, y: 126, text: v.shipper[0], field: 'shipper', bold: true, degraded: deg('shipper') },
    ...v.shipper.slice(1).map((line, i): DocElement => ({ t: 'value', x: 42, y: 142 + i * 14, text: line, size: 10.5 })),

    // Consignee
    { t: 'box', x: 36, y: 152, w: 568, h: 62 },
    { t: 'label', x: 42, y: 166, text: 'Consignee' },
    { t: 'value', x: 42, y: 188, text: v.consignee[0], field: 'consignee', bold: true, degraded: deg('consignee') },
    ...v.consignee.slice(1).map((line, i): DocElement => ({ t: 'value', x: 42, y: 204 + i * 14, text: line, size: 10.5 })),

    // Notify party
    { t: 'box', x: 36, y: 214, w: 568, h: 62 },
    { t: 'label', x: 42, y: 228, text: 'Notify party' },
    { t: 'value', x: 42, y: 250, text: v.notifyParty[0], field: 'notifyParty', bold: true, degraded: deg('notifyParty') },
    ...v.notifyParty.slice(1).map((line, i): DocElement => ({ t: 'value', x: 42, y: 266 + i * 14, text: line, size: 10.5 })),

    // Vessel / voyage
    { t: 'box', x: 36, y: 276, w: 284, h: 42 },
    { t: 'label', x: 42, y: 290, text: 'Vessel' },
    { t: 'value', x: 42, y: 310, text: v.vessel },
    { t: 'box', x: 320, y: 276, w: 284, h: 42 },
    { t: 'label', x: 326, y: 290, text: 'Voyage' },
    { t: 'value', x: 326, y: 310, text: v.voyage, mono: true },

    // Ports
    { t: 'box', x: 36, y: 318, w: 284, h: 44 },
    { t: 'label', x: 42, y: 332, text: 'Port of loading' },
    { t: 'value', x: 42, y: 354, text: v.portOfLoading, field: 'portOfLoading', bold: true, degraded: deg('portOfLoading') },
    { t: 'box', x: 320, y: 318, w: 284, h: 44 },
    { t: 'label', x: 326, y: 332, text: 'Port of discharge' },
    { t: 'value', x: 326, y: 354, text: v.portOfDischarge, field: 'portOfDischarge', bold: true, degraded: deg('portOfDischarge') },

    // Place of receipt / delivery
    { t: 'box', x: 36, y: 362, w: 284, h: 40 },
    { t: 'label', x: 42, y: 376, text: 'Place of receipt' },
    { t: 'value', x: 42, y: 394, text: v.portOfLoading + ' CY', size: 10.5 },
    { t: 'box', x: 320, y: 362, w: 284, h: 40 },
    { t: 'label', x: 326, y: 376, text: 'Place of delivery' },
    { t: 'value', x: 326, y: 394, text: v.portOfDischarge + ' CY', size: 10.5 },

    // Cargo table
    { t: 'label', x: 36, y: 424, text: 'Particulars furnished by the shipper' },
    { t: 'box', x: 36, y: 432, w: 568, h: 150 },
    { t: 'rule', x: 36, y: 456, w: 568 },
    { t: 'vrule', x: 180, y: 432, h: 150 },
    { t: 'vrule', x: 360, y: 432, h: 150 },
    { t: 'vrule', x: 440, y: 432, h: 150 },
    { t: 'vrule', x: 528, y: 432, h: 150 },
    { t: 'label', x: 42, y: 448, text: 'Marks and numbers' },
    { t: 'label', x: 186, y: 448, text: 'Description of goods' },
    { t: 'label', x: 366, y: 448, text: 'Containers' },
    { t: 'label', x: 446, y: 448, text: 'Gross weight kg' },
    { t: 'label', x: 534, y: 448, text: 'Measurement' },
    { t: 'value', x: 42, y: 472, text: v.marks, size: 10, mono: true },
    ...v.containerNos.map((c, i): DocElement => ({ t: 'value', x: 42, y: 488 + i * 12, text: c, size: 9, mono: true })),
    { t: 'value', x: 186, y: 472, text: v.goods, size: 10, w: 168 },
    { t: 'value', x: 186, y: 508, text: 'Freight prepaid. CY / CY.', size: 9.5, w: 168 },
    { t: 'rule', x: 36, y: 540, w: 568 },
    { t: 'label', x: 42, y: 556, text: 'Totals declared by shipper' },
    { t: 'value', x: 366, y: 570, text: v.containerCount, field: 'containerCount', bold: true, mono: true, degraded: deg('containerCount') },
    { t: 'value', x: 446, y: 570, text: v.grossWeightKg, field: 'grossWeightKg', bold: true, mono: true, degraded: deg('grossWeightKg') },
    { t: 'value', x: 534, y: 570, text: v.measurement, size: 10, mono: true },

    // Declaration + signature
    { t: 'note', x: 36, y: 606, w: 568, text: 'The shipper declares the above particulars to be correct and complete. Any correction after the closing time may attract an amendment fee. Weights are as declared at the container yard weighbridge.' },
    { t: 'rule', x: 36, y: 700, w: 240 },
    { t: 'label', x: 36, y: 714, text: 'Authorised signature, shipper' },
    { t: 'rule', x: 364, y: 700, w: 240 },
    { t: 'label', x: 364, y: 714, text: 'Date and company stamp' },
    { t: 'label', x: 36, y: 862, text: 'Page 1 of 1 — Shipping instruction — ' + v.reference },
  ];
  return { elements: e };
}

/* ---------- draft Bill of Lading template ---------- */

function blPage(v: DocValues): DocPage {
  const deg = (f: FieldKey) => (v.degradedField === f ? true : undefined);
  const e: DocElement[] = [
    { t: 'title', x: 36, y: 46, text: 'BILL OF LADING', size: 15 },
    { t: 'label', x: 36, y: 62, text: 'Non-negotiable draft for shipper approval' },
    { t: 'label', x: 404, y: 40, text: 'B/L no.' },
    { t: 'value', x: 404, y: 56, text: 'DRAFT-' + v.booking, mono: true, size: 11 },
    { t: 'label', x: 404, y: 70, text: 'Booking no.' },
    { t: 'value', x: 404, y: 86, text: v.booking, mono: true, size: 11 },
    { t: 'label', x: 528, y: 70, text: 'Issued' },
    { t: 'value', x: 528, y: 86, text: v.date, size: 11 },
    { t: 'stamp', x: 372, y: 210, text: 'DRAFT', angle: -16 },
    { t: 'rule', x: 36, y: 76, w: 340 },
    { t: 'box', x: 36, y: 92, w: 568, h: 22, fill: true },
    { t: 'label', x: 42, y: 107, text: 'Carrier: Havenport Lines — Container service' },

    // Shipper
    { t: 'box', x: 36, y: 114, w: 568, h: 66 },
    { t: 'label', x: 42, y: 128, text: 'Shipper / Exporter' },
    { t: 'value', x: 42, y: 150, text: v.shipper[0], field: 'shipper', bold: true, degraded: deg('shipper') },
    ...v.shipper.slice(1).map((line, i): DocElement => ({ t: 'value', x: 42, y: 166 + i * 14, text: line, size: 10.5 })),

    // Consignee
    { t: 'box', x: 36, y: 180, w: 568, h: 66 },
    { t: 'label', x: 42, y: 194, text: 'Consignee (complete name and address)' },
    { t: 'value', x: 42, y: 216, text: v.consignee[0], field: 'consignee', bold: true, degraded: deg('consignee') },
    ...v.consignee.slice(1).map((line, i): DocElement => ({ t: 'value', x: 42, y: 232 + i * 14, text: line, size: 10.5 })),

    // Notify party
    { t: 'box', x: 36, y: 246, w: 568, h: 66 },
    { t: 'label', x: 42, y: 260, text: 'Notify party' },
    { t: 'value', x: 42, y: 282, text: v.notifyParty[0], field: 'notifyParty', bold: true, degraded: deg('notifyParty') },
    ...v.notifyParty.slice(1).map((line, i): DocElement => ({ t: 'value', x: 42, y: 298 + i * 14, text: line, size: 10.5 })),

    // Vessel / voyage
    { t: 'box', x: 36, y: 312, w: 284, h: 40 },
    { t: 'label', x: 42, y: 326, text: 'Ocean vessel' },
    { t: 'value', x: 42, y: 344, text: v.vessel, size: 11 },
    { t: 'box', x: 320, y: 312, w: 284, h: 40 },
    { t: 'label', x: 326, y: 326, text: 'Voyage no.' },
    { t: 'value', x: 326, y: 344, text: v.voyage, mono: true, size: 11 },

    // Ports — labels can differ from the SI wording
    { t: 'box', x: 36, y: 352, w: 284, h: 44 },
    { t: 'label', x: 42, y: 366, text: v.polLabel ?? 'Port of loading' },
    { t: 'value', x: 42, y: 388, text: v.portOfLoading, field: 'portOfLoading', bold: true, degraded: deg('portOfLoading') },
    { t: 'box', x: 320, y: 352, w: 284, h: 44 },
    { t: 'label', x: 326, y: 366, text: v.podLabel ?? 'Port of discharge' },
    { t: 'value', x: 326, y: 388, text: v.portOfDischarge, field: 'portOfDischarge', bold: true, degraded: deg('portOfDischarge') },

    // Freight terms strip
    { t: 'box', x: 36, y: 396, w: 568, h: 36 },
    { t: 'label', x: 42, y: 410, text: 'Freight and charges' },
    { t: 'value', x: 42, y: 426, text: 'Freight prepaid — CY / CY — 1 original issued', size: 10.5 },

    // Cargo table
    { t: 'box', x: 36, y: 446, w: 568, h: 146 },
    { t: 'rule', x: 36, y: 476, w: 568 },
    { t: 'vrule', x: 176, y: 446, h: 146 },
    { t: 'vrule', x: 296, y: 446, h: 146 },
    { t: 'vrule', x: 400, y: 446, h: 146 },
    { t: 'vrule', x: 512, y: 446, h: 146 },
    { t: 'label', x: 42, y: 462, text: 'Container / seal no.' },
    { t: 'label', x: 182, y: 462, text: 'Description' },
    { t: 'label', x: 302, y: 462, text: 'No. of pkgs' },
    { t: 'label', x: 406, y: 462, text: 'Gross weight KGS' },
    { t: 'label', x: 518, y: 462, text: 'Measurement' },
    ...v.containerNos.map((c, i): DocElement => ({ t: 'value', x: 42, y: 492 + i * 12, text: c, size: 9, mono: true })),
    { t: 'value', x: 182, y: 492, text: v.goods, size: 9.5, w: 108 },
    { t: 'value', x: 182, y: 528, text: 'Said to contain', size: 9.5, w: 108 },
    { t: 'rule', x: 36, y: 548, w: 568 },
    { t: 'label', x: 42, y: 564, text: 'Total as per carrier tally' },
    { t: 'value', x: 302, y: 578, text: v.containerCount, field: 'containerCount', bold: true, mono: true, degraded: deg('containerCount') },
    { t: 'value', x: 406, y: 578, text: v.grossWeightKg, field: 'grossWeightKg', bold: true, mono: true, degraded: deg('grossWeightKg') },
    { t: 'value', x: 518, y: 578, text: v.measurement, size: 10, mono: true },

    { t: 'note', x: 36, y: 614, w: 568, text: 'Received by the carrier the goods described above in apparent good order and condition unless otherwise stated, to be carried subject to all the terms and conditions on the face and back of this bill of lading. Particulars above are furnished by the shipper and are not checked by the carrier.' },
    { t: 'rule', x: 36, y: 720, w: 240 },
    { t: 'label', x: 36, y: 734, text: 'Signed for the carrier' },
    { t: 'rule', x: 364, y: 720, w: 240 },
    { t: 'label', x: 364, y: 734, text: 'Place and date of issue' },
    { t: 'label', x: 36, y: 862, text: 'Page 1 of 2 — Draft bill of lading — DRAFT-' + v.booking },
  ];
  return { elements: e };
}

/** Page 2 of a BL: terms text, so page controls have somewhere to go. */
function blTermsPage(v: DocValues): DocPage {
  const lines = [
    'Definitions. In this bill of lading the carrier means the party on whose behalf this bill of lading has been signed.',
    'Carrier’s tariff. The terms of the carrier’s applicable tariff are incorporated into this bill of lading.',
    'Route. The carrier may at any time and without notice substitute vessels, transship, or proceed by any route.',
    'Description. The shipper warrants to the carrier that the particulars relating to the goods as set out on the face of',
    'this bill of lading have been checked by the shipper on receipt of this bill of lading and that such particulars, and',
    'any other particulars furnished by or on behalf of the shipper, are adequate and correct.',
    'Weights. Where the gross weight stated on the face of this bill of lading is furnished by the shipper, the carrier',
    'accepts no responsibility for its accuracy and the shipper indemnifies the carrier against any claim arising from a',
    'misdeclared weight, including any fine levied by a port authority or terminal operator.',
    'Containers. Goods stowed in a container by or on behalf of the shipper are at the shipper’s risk.',
    'Notice of claim. The carrier shall be discharged of all liability unless notice of loss or damage is given in writing.',
    'Law and jurisdiction. This bill of lading is governed by the law stated in the carrier’s tariff.',
  ];
  const e: DocElement[] = [
    { t: 'title', x: 36, y: 46, text: 'TERMS AND CONDITIONS', size: 13 },
    { t: 'rule', x: 36, y: 56, w: 568 },
    ...lines.map((text, i): DocElement => ({ t: 'value', x: 36, y: 86 + i * 30, text, size: 9.5, w: 568 })),
    { t: 'label', x: 36, y: 862, text: 'Page 2 of 2 — Draft bill of lading — DRAFT-' + v.booking },
  ];
  return { elements: e };
}

/* ---------- builders ---------- */

export function buildSI(
  id: string,
  filename: string,
  values: DocValues,
  render: 'text' | 'scan' = 'text',
): DocumentFacsimile {
  return { id, kind: 'SI', filename, render, pages: [siPage(values)], regions: SI_REGIONS };
}

export function buildBL(
  id: string,
  filename: string,
  values: DocValues,
  render: 'text' | 'scan' = 'text',
): DocumentFacsimile {
  return {
    id,
    kind: 'BL',
    filename,
    render,
    pages: [blPage(values), blTermsPage(values)],
    regions: BL_REGIONS,
  };
}
