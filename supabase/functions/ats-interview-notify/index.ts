// ATS: interview emails to the candidate and the interviewers. See notify.ts.
import { handleNotify } from './notify.ts'

Deno.serve((req) => handleNotify(req))
