// ATS: sends a candidate email. See send.ts.
import { handleSend } from './send.ts'

Deno.serve(handleSend)
