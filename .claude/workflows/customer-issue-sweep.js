export const meta = {
  name: 'customer-issue-sweep',
  description: 'One investigation iteration for a Chatwoot customer issue: parallel evidence tracks (live account data, codebase) then synthesis',
  whenToUse: 'Invoked by the solve-customer-issue skill each loop iteration; args carry issue context and per-track questions',
  phases: [
    { title: 'Evidence', detail: 'parallel: live account data (Chatwoot API + Meta Graph) / code paths' },
    { title: 'Synthesis', detail: 'correlate tracks, score hypotheses, plan next iteration' },
  ],
}

let a = args || {}
if (typeof a === 'string') {
  try {
    a = JSON.parse(a)
  } catch (e) {
    throw new Error(`args arrived as a non-JSON string: ${e.message}`)
  }
}
if (!a.issue) throw new Error('args.issue is required — a summary of the customer issue')
const skip = a.skip || {}
const questions = a.questions || {}

const FINDINGS_SCHEMA = {
  type: 'object',
  required: ['findings', 'open_questions'],
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['claim', 'evidence', 'confidence'],
        properties: {
          claim: { type: 'string' },
          evidence: { type: 'string', description: 'exact cwapi/metaapi command or file:line, and what it returned' },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
          prediction: { type: 'string', description: 'falsifiable check the other track could run' },
        },
      },
    },
    timeline: {
      type: 'array',
      items: {
        type: 'object',
        required: ['at', 'event'],
        properties: {
          at: { type: 'string', description: 'UTC timestamp or range' },
          event: { type: 'string' },
          source: { type: 'string' },
        },
      },
    },
    open_questions: { type: 'array', items: { type: 'string' } },
    dead_ends: {
      type: 'array',
      items: {
        type: 'object',
        required: ['hypothesis', 'refuted_by'],
        properties: {
          hypothesis: { type: 'string' },
          refuted_by: { type: 'string' },
        },
      },
    },
    needs_engineering: {
      type: 'array',
      items: { type: 'string' },
      description: 'questions this track cannot answer with a read-only agent-role token — server logs, DB reads, admin-only endpoints, Super Admin. These become the escalation packet.',
    },
    blocked: { type: 'string', description: 'set ONLY if the whole track could not run, e.g. missing-creds / api_and_webhooks-disabled / not-a-member-of-account' },
  },
}

const SYNTHESIS_SCHEMA = {
  type: 'object',
  required: ['summary', 'root_cause_candidates', 'done', 'next_iteration'],
  properties: {
    summary: { type: 'string' },
    established_timeline: { type: 'array', items: { type: 'string' }, description: 'merged UTC timeline, one event per entry' },
    root_cause_candidates: {
      type: 'array',
      items: {
        type: 'object',
        required: ['statement', 'confidence', 'supporting', 'contradicting'],
        properties: {
          statement: { type: 'string' },
          confidence: { type: 'string', enum: ['confirmed', 'likely', 'speculative'] },
          supporting: { type: 'array', items: { type: 'string' } },
          contradicting: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    done: { type: 'boolean', description: 'true ONLY when one candidate is confirmed by >= 2 independent evidence sources of different kinds' },
    next_iteration: {
      type: 'object',
      properties: {
        data: { type: 'array', items: { type: 'string' } },
        code: { type: 'array', items: { type: 'string' } },
      },
      description: 'concrete questions per track for the next sweep; empty arrays when done',
    },
    blocked_on_user: { type: 'array', items: { type: 'string' }, description: 'inputs only Harishmita can provide (API token, inbox membership on the account, ids from the customer, a Meta token)' },
    escalation_asks: {
      type: 'array',
      items: { type: 'string' },
      description: 'evidence that exists but is out of reach from a read-only agent token — phrased as a precise, self-contained ask for an engineer with server-log/console access (what to look for, which account/identifier, which UTC window)',
    },
  },
}

const fmtQuestions = (list, fallback) =>
  (list && list.length ? list : [fallback]).map(q => `- ${q}`).join('\n')

const header = [
  `# Customer issue\n${a.issue}`,
  a.account_id ? `Account ID: ${a.account_id}` : null,
  a.base_url ? `Base URL: ${a.base_url}` : null,
  a.time_window ? `Relevant time window (UTC): ${a.time_window}` : null,
  a.identifiers ? `Known identifiers: ${JSON.stringify(a.identifiers)}` : null,
  a.context ? `# Established so far (do not re-derive; build on it)\n${a.context}` : null,
  `# Access reality (do not plan around evidence you cannot reach)\nThere is NO production-log track in this harness. Nobody on this investigation has server logs, a Rails console, or database access. The Chatwoot API token is an **agent-role** token, so admin-only reads (automation rules, webhooks, audit logs, reports, campaigns, inbox provider_config) return 401 and conversations/inboxes/search are scoped to the inboxes the token's user is a member of. Anything that genuinely needs logs or admin access is not a dead end to work around silently — record it in needs_engineering, precisely enough that an engineer could act on it without re-reading this thread.`,
].filter(Boolean).join('\n\n')

// The Agent-type registry snapshots at session start: agents authored mid-session
// won't resolve via agentType. Callers can pass args.role_prompts = {data, code}
// (the agent .md bodies) — then the default subagent is used with the role inlined.
const roles = a.role_prompts || {}
const trackCall = (track, agentTypeName, prompt) => {
  const opts = { label: track, phase: 'Evidence', schema: FINDINGS_SCHEMA }
  if (roles[track]) return () => agent(`# Your role\n${roles[track]}\n\n---\n\n${prompt}`, opts)
  opts.agentType = agentTypeName
  return () => agent(`${prompt}\n\nFollow your standard method and output contract.`, opts)
}

const tracks = []
const trackNames = []

if (!skip.data) {
  trackNames.push('data')
  tracks.push(trackCall('data', 'cw-data-inspector',
    a.creds_file
      ? `${header}\n\nCredentials file (source it, never print it): ${a.creds_file}\n\n# Your questions this iteration\n${fmtQuestions(questions.data, 'Pull the records involved in this issue and report their actual state.')}`
      : `${header}\n\nNo credentials file was provided, so you CANNOT reach the API. Return immediately with blocked: "missing-creds", no findings, and copy the intended checks below into open_questions VERBATIM so they survive into the next iteration:\n${fmtQuestions(questions.data, 'Pull the records involved in this issue and report their actual state.')}`))
}

if (!skip.code) {
  trackNames.push('code')
  tracks.push(trackCall('code', 'cw-code-detective',
    `${header}\n\n# Your questions this iteration\n${fmtQuestions(questions.code, 'Identify the code paths that could produce this symptom and what evidence each would leave in data the API can read.')}`))
}

if (!tracks.length) throw new Error('all tracks skipped — nothing to do')

// Synthesis genuinely needs every track's findings at once — barrier is correct here.
const results = await parallel(tracks)
const byTrack = {}
trackNames.forEach((name, i) => { byTrack[name] = results[i] })

const dropped = trackNames.filter((name, i) => !results[i])
if (dropped.length) log(`tracks returned nothing (error/skip): ${dropped.join(', ')}`)

const synthesis = await agent(
  `You are the synthesis stage of a Chatwoot customer-issue investigation run by a customer support executive (no production logs, no console, no DB — an agent-role API token and the codebase). Correlate the evidence tracks below, judge hypotheses, and plan the next iteration.\n\n${header}\n\n# Track findings (JSON; a null track errored out — treat as no evidence, not refutation)\n${JSON.stringify(byTrack, null, 2)}\n\nRules:\n- A root cause is "confirmed" ONLY with >= 2 independent supporting evidence sources of DIFFERENT KINDS (a Chatwoot-side data state vs a Meta-side metaapi check vs a code path vs a customer-supplied artifact such as a screenshot or a provider dashboard). Two restatements of the same underlying observation do not count, and two metaapi checks are one kind.\n- A NULL result is NEVER one of the two. "The API returns no conversations" is not proof none exist: an agent-role token only sees inboxes its user is a member of, and admin-only endpoints answer 401 — establish that the read could have seen the record before treating its absence as evidence.\n- Take dead_ends seriously: do not resurrect a refuted hypothesis without new evidence.\n- Cross-check each track's falsifiable predictions against the other track's findings; unresolved predictions become next_iteration questions for the track that can test them.\n- If a track was blocked (see its "blocked" field), surface what unblocks it in blocked_on_user.\n- Roll up every track's needs_engineering into escalation_asks, deduplicated and rewritten as standalone asks: what to look for, which account/inbox/identifier, which UTC window, and what the answer would prove or kill. Never let an unreachable-evidence item silently disappear.\n- next_iteration questions must be concrete and answerable with the available access (name the record, the endpoint, the file), not "investigate more".\n- Set done=true only when the confirmed cause fully explains the customer-visible symptom and the timeline has no unexplained contradictions. A cause that can only be settled by server logs is NOT done — mark it "likely" and escalate.`,
  { label: 'synthesize', phase: 'Synthesis', schema: SYNTHESIS_SCHEMA }
)

return { tracks: byTrack, synthesis }
