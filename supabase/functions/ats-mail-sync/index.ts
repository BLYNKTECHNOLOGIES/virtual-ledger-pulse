// ATS: candidate email reader. See sync.ts.
import { handleSync } from './sync.ts'

Deno.serve(handleSync)
