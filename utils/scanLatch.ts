// A camera barcode reader is not a button. CameraView calls onBarcodeScanned for every frame in
// which it can resolve a code, so a packet held steady in front of the lens reports the same digits
// dozens of times a second. Handled naively that is dozens of Open Food Facts lookups, dozens of
// decrements against the user's weekly AI-log allowance, and a candidate list that grows a
// duplicate row per frame, all from one scan of one tin.
//
// The latch makes "one opening of the scanner yields at most one lookup" explicit rather than
// leaving it implied by a boolean somebody might later refactor away. It deliberately does not
// remember which code it saw: re-scanning the same packet is a legitimate thing to want, so the
// arming is tied to opening the scanner, not to the value.

export interface ScanLatch {
  /** True for the first code decoded since the last rearm, false for every one after it. */
  accept(): boolean;
  /** Arm for the next opening of the scanner. */
  rearm(): void;
}

export function createScanLatch(): ScanLatch {
  let armed = true;
  return {
    accept() {
      if (!armed) return false;
      armed = false;
      return true;
    },
    rearm() {
      armed = true;
    },
  };
}
