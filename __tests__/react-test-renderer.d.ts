// react-test-renderer ships with jest-expo (the test preset) but without type declarations. Only what
// the hook tests use is declared here, rather than adding a dependency just for types.
declare module "react-test-renderer" {
  import type { ReactElement } from "react";

  export interface ReactTestRenderer {
    unmount(): void;
  }

  export function create(element: ReactElement): ReactTestRenderer;
  export function act(callback: () => void | Promise<void>): Promise<void>;
}
