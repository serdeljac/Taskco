import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Empties the page after every test. Without it, what one test rendered is still there in the next,
// and finding "Website" finds two
afterEach(() => {
    cleanup();
});
