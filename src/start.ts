import { createStart } from "@tanstack/react-start";

// Static SPA: no server middleware, auth attachment, or server functions.
export const startInstance = createStart(() => ({}));
