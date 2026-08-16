import { useCallback, useEffect, useState } from "react";
import * as biometricAuth from "@/services/biometricAuth";
import {
  canOfferBiometricSignIn,
  type BiometricCapability,
  type StoredCredential,
} from "@/utils/biometricLogin";

// Everything the UI needs to know about biometric sign-in, in one place.
//
// Both halves have to be read asynchronously (one crosses into the native module, the other into
// the keychain), so screens would otherwise each need their own effect, their own loading flag, and
// their own reload-after-change dance. `ready` exists so the sign-in screen can render nothing
// rather than flashing a Face ID button in and out on every mount.

export interface BiometricLoginState {
  /** What the hardware can do, and what to call it. */
  capability: BiometricCapability;
  /** Who the registered credential belongs to, if there is one. */
  credential: StoredCredential | null;
  /** A credential is registered on this device. */
  enabled: boolean;
  /** Safe to show the sign-in button: usable sensor AND a registered credential. */
  canSignIn: boolean;
  /** Both reads have completed at least once. */
  ready: boolean;
  /** Re-read after enabling, disabling, or a failed attempt that cleared the credential. */
  reload: () => Promise<void>;
}

const UNAVAILABLE: BiometricCapability = { available: false, kind: "generic" };

export function useBiometricLogin(): BiometricLoginState {
  const [capability, setCapability] = useState<BiometricCapability>(UNAVAILABLE);
  const [credential, setCredential] = useState<StoredCredential | null>(null);
  const [ready, setReady] = useState(false);

  const reload = useCallback(async () => {
    const [nextCapability, nextCredential] = await Promise.all([
      biometricAuth.getCapability(),
      biometricAuth.getStoredCredential(),
    ]);
    setCapability(nextCapability);
    setCredential(nextCredential);
    setReady(true);
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      const [nextCapability, nextCredential] = await Promise.all([
        biometricAuth.getCapability(),
        biometricAuth.getStoredCredential(),
      ]);
      // The keychain read can outlive the screen, and setting state on an unmounted component is a
      // warning nobody can action.
      if (!active) return;
      setCapability(nextCapability);
      setCredential(nextCredential);
      setReady(true);
    })();
    return () => {
      active = false;
    };
  }, []);

  return {
    capability,
    credential,
    enabled: credential !== null,
    canSignIn: canOfferBiometricSignIn(capability, credential),
    ready,
    reload,
  };
}
