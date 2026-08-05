Approval Workflow Service

Background
An operations platform receives departmental requests that authorised reviewers can approve, reject, or return for correction.
Every decision must follow a valid state transition and remain traceable.
Build the following service:

Capability 1 — Requests and Decisions
• Create endpoints to submit, list, view, comment on, and decide a request.
• Support approve, reject, and return-for-correction outcomes.

Capability 2 — Control and Integrity
• Enforce valid state transitions and a simple reviewer permission model.
• Protect against accidental duplicate decisions and preserve an append-only activity history.

Capability 3 — Reliability
• Test successful decisions, invalid transitions, repeated requests, and unauthorised actions.
• Document consistency choices, known limits, and how an operator can diagnose a failed request.


Rules for implementation
1. ES Modules
The project uses ES Modules ("type": "module" in package.json). Use import/export; never require/module.exports.

// Good
import { getConfig } from "../config/index.js";
export async function handler(req, res) { ... }

// Bad
const { getConfig } = require("../config/index.js");
module.exports = { handler };

2. Path extensions
Always use .ts extensions in relative imports:

import prisma from "../database/index.ts";  // correct
import prisma from "../database/index";     // wrong

3. Never use em-dash for any documentation, code lines/comments or anything. Use hyphen or semi-colon instead where necessary.

4. Comments
Place a short comment above any non-obvious code to explain why it exists or what it achieves. Aim for the "hard-to-understand areas" bar, straightforward getters, simple assignments, and self-explanatory one-liners don't need them. For example:
// Ensure the uploads directory exists at app startup. `recursive: true` avoids
// errors if the directory is already present.
const uploadDir = join(process.cwd(), constants.UPLOAD.DIR);
mkdirSync(uploadDir, { recursive: true });

// Set for O(1) extension lookups during file filtering.
const ALLOWED_EXT = new Set(constants.UPLOAD.ALLOWED_EXTENSIONS);

Keep inline comments to 1-3 lines. Prefer explaining the intent over restating what the code does:

5. HttpStatus — no hardcoded status codes
// Bad
return { statusCode: 200, message: 'Profile fetched' };

// Good
import { HttpStatus } from '@nestjs/common';

return {
  statusCode: HttpStatus.OK,
  message: SYS_MSG.OPERATION_SUCCESSFUL,
  data,
};

6. System message constants — no free-text strings
Source of truth: src/constants/system.messages.ts. Add the constant there before using it anywhere — services, controllers, guards, and Swagger docs all import from it so wording stays uniform.

// Bad
throw new NotFoundException('User not found');

// Good
import * as SYS_MSG from '../../constants/system.messages';

throw new NotFoundException(SYS_MSG.USER_NOT_FOUND);

7. No any in the codebase
Zero any types in DTOs, services, controllers, guards, or utilities. Enforced by ESLint (@typescript-eslint/no-explicit-any: error). Use precise types, generics, or unknown with narrowing.

8. Strongly typed signatures
Annotate all parameters and return types explicitly.

async findByEmail(email: string): Promise<User | null> { ... }

9. Configuration
Never read process.env directly outside src/config/env.ts - see Environment Variables below. Consume config from the src/config/*.config.ts factories (app.config.ts, database.config.ts, jwt.config.ts, redis.config.ts).

10. Database access - AbstractModelAction
Services must never inject a raw Repository<T>. No raw SQL anywhere except migrations.

11. All env vars are declared in src/config/env.ts and accessed via the exported env object — never via process.env directly. The Zod schema there validates values at boot and fails fast on missing or malformed config; a direct process.env read silently bypasses that safety net and loses type information.

// Bad
const port = process.env.PORT;

// Good
import { env } from '../../config/env'; // path relative to your file
const port = env.PORT;

12. Casing
Entities and columns are snake_case; everything else — especially API responses — is camelCase. Map between them in the service.

13. each module self-contained
Every module handles their Module tests stay close to the code they verify.
Shared setup (database, Redis, factories, helpers) is reused instead of duplicated.

14. 6. Folder layout per module
Put each artifact in its dedicated folder: entities/, enums/, interfaces/, dto/, docs/ (Swagger), actions/ (DB access) all where necessary, along with the standard service, controller, routes etc.