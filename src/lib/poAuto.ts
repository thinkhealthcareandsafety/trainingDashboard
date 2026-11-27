/**
 * Find POs reading the WorkDrive PO folder by itself (owner, 27 Nov: "pause the autoscanning for the invoice converter
 * PO"). Off: neither the Zoho sync nor opening the Invoice Converter starts a scan; the Find POs button still does.
 * Turn it back on with true.
 */
export const PO_AUTO_SCAN = false;
