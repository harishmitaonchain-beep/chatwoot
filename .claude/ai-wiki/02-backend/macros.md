---
title: "Macros"
tags: [chatwoot, backend, automation, conversations, enterprise]
generated: 2026-08-17
deepwiki_section: "AI and Automation (Captain, automation rules/macros, agent bots)"
---

# Macros

## Purpose

Macros are agent-triggered (as opposed to event-triggered) sequences of conversation actions — an agent picks a saved macro from the conversation view and it runs a fixed list of steps (send a reply, add a label, assign an agent, change status, etc.) against that conversation in one shot. `app/services/macros` holds the single service object, `Macros::ExecutionService`, that actually walks a macro's `actions` array and executes each step. It is the sibling of `AutomationRules::ActionService` (event-driven automations) — both share the same underlying `ActionService` action vocabulary, but macros are always initiated by a human clicking "Run macro", not by a rule matching an event.

## Key Files & Classes

- `app/services/macros/execution_service.rb` — `Macros::ExecutionService < ActionService`. Iterates `macro.actions`, dispatches each `action_name` to a method via `send`, rescues and reports any `StandardError` per-action via `ChatwootExceptionTracker` (one failing action doesn't abort the rest), and sets/resets `Current.user` around the run.
- `app/services/action_service.rb` — the shared base class (not in this directory, but the module can't be understood without it). Implements the actual conversation-mutating actions common to both macros and automation rules: `mute_conversation`, `snooze_conversation`, `resolve_conversation`, `open_conversation`, `pending_conversation`, `change_status`, `change_priority`, `add_label`/`remove_label`, `assign_agent`/`assign_team`, `remove_assigned_agent`/`remove_assigned_team`, `send_email_transcript`. Includes `EmailHelper`; guards conversation-mutating writes (`assign_agent`, `assign_team`, `remove_assigned_agent`, `remove_assigned_team`) with `@conversation.with_lock` to avoid races with concurrent assignment (e.g. `AutoAssignment::AssignmentService`).
- `app/models/macro.rb` — `Macro` model. `actions` is a `jsonb` column (array of `{action_name, action_params}` hashes); `ACTIONS_ATTRS` is the allow-list validated by `json_actions_format`. `visibility` enum (`personal`/`global`); `set_visibility` forces agents (non-admins) to `personal`. `with_visibility` scopes to global macros plus the current user's own personal macros. `has_many_attached :files` backs the `send_attachment` action.
- `app/jobs/macros_execution_job.rb` — `MacrosExecutionJob`, queue `:medium`. Looks up conversations by `display_id` under the macro's account and calls `Macros::ExecutionService.new(macro, conversation, user).perform` once per conversation — this is how a macro can run against multiple conversations from a bulk-select action.
- `app/controllers/api/v1/accounts/macros_controller.rb` — CRUD plus `execute`, which just enqueues `MacrosExecutionJob.perform_later`. Uses `AttachmentConcern` to validate/prepare uploaded files for the `send_attachment` action before save.
- `app/policies/macro_policy.rb` — `show?`/`execute?` allow global macros or the author; `update?`/`destroy?` require admin for global macros, author otherwise.
- `enterprise/app/services/enterprise/macros/execution_service.rb` — `Enterprise::Macros::ExecutionService`, mixed into `Macros::ExecutionService` via `include_mod_with('Macros::ExecutionService')` at the bottom of the OSS file. Wraps `resolve_conversation` and `change_status` (when transitioning to resolved) to no-op if the account has the `conversation_required_attributes` feature enabled and required conversation custom attributes aren't filled in yet.
- `enterprise/app/models/enterprise/audit/macro.rb` — mixed into `Macro` via `include_mod_with('Audit::Macro')`; adds `audited associated_with: :account` (audit-log trail for macro changes), gated by the Enterprise `audited` gem overlay.
- `app/services/automation_rules/action_service.rb` — not in this directory but the closest sibling: same `ActionService` base, different trigger (event-driven rule instead of a user click) and a slightly different action set (`send_email_to_team` instead of macro-only `send_webhook_event`/`add_private_note`/`send_attachment` overrides — actually both classes override `send_attachment`/`send_webhook_event`/`send_message`/`add_private_note` independently, each attaching files from its own owning record, `macro.files` vs `rule.files`, and each tagging the outgoing webhook event name differently: `macro.executed` vs `automation_event.#{rule.event_name}`).

## How It Fits Together

- **Trigger path**: dashboard agent picks a macro from the conversation view → `POST .../macros/:id/execute` → `MacrosController#execute` → `MacrosExecutionJob.perform_later(macro, conversation_ids:, user:)` → job resolves each `Conversation` by `display_id` and calls `Macros::ExecutionService#perform` per conversation.
- **Conversation & message writes**: actions call straight into [[models]] (`Conversation#mute!`/`resolved!`/etc., `Conversation#add_labels`, `label_list=`) and into `Messages::MessageBuilder` (see [[messages-services]]) for `send_message`/`add_private_note`/`send_attachment`, so a macro produces the same message-creation path a human reply would.
- **Assignment**: `assign_agent`/`assign_team`/`remove_assigned_*` go through the same locking pattern used elsewhere in assignment — see [[assignment]] for the broader picture of concurrent-assignment races this locking is meant to avoid.
- **Automation overlap**: shares its action vocabulary and base class (`ActionService`) with [[automation-rules]] (`AutomationRules::ActionService`) — anyone changing behavior in `ActionService` affects both macros and automation rules simultaneously.
- **Webhooks**: `send_webhook_event` enqueues `WebhookJob` (see [[jobs]]) with `event: 'macro.executed'`, delivered through the account's configured webhook endpoints — part of the same [[integrations]]/webhook delivery path as other account webhook events.
- **Exception handling**: per-action failures are captured via `ChatwootExceptionTracker` rather than raised, so an account misconfiguration (e.g. a stale agent/team id in a saved macro) doesn't halt the remaining actions or fail the job.
- **Enterprise extension point**: `Macros::ExecutionService.include_mod_with('Macros::ExecutionService')` is the hook the Enterprise overlay uses to gate `resolve_conversation`/`change_status(resolved)` behind required-conversation-attributes — see [[models-services]] and [[controllers-jobs-listeners]] for the broader Enterprise overlay pattern.
- **Model layer**: `Macro` itself belongs to `Account`, `created_by`/`updated_by` (`User`), and `has_many_attached :files` (ActiveStorage) — see [[models]].

## Product Behavior

This backend maps to the "Macros" feature described in the official user guide's Features/Advanced-features "canned responses / macros" topics: an agent-authored, reusable sequence of actions (as opposed to a canned response, which is just a text snippet) that can be run manually against one or more open conversations from the conversation view. The guide's macros article covers building the action list (reply, private note, change status/priority, assign agent/team, add/remove labels, send attachment, trigger webhook) and the personal-vs-global visibility distinction that `Macro#visibility` and `MacroPolicy` implement — global macros are shared account-wide (edit/delete restricted to admins), personal macros are visible only to their author. This is distinct from the separate "automation" guide topic (event-triggered rules), even though both features share the same underlying action set in code.

## Notes for AI Agents

- `action[:action_params]` values are always arrays (e.g. `message[0]`, `agent_ids[0]`, `webhook_url.first`) — the frontend always submits action params as arrays even for single-value actions like `send_message` or `change_status`. Don't assume a scalar.
- `Macro::ACTIONS_ATTRS` is the source of truth for which action names are valid; if you add a new action method to `ActionService` or `Macros::ExecutionService`, you must also add its name to `ACTIONS_ATTRS` or `Macro#json_actions_format` will reject the macro at save time.
- `resolved?`/`change_status` status comparisons in the Enterprise override check both the string enum name and the integer value (`Conversation.statuses['resolved']`) because action params are raw JSON and may have been serialized either way depending on when/how the macro was authored — don't assume one format.
- `Macros::ExecutionService#perform` rescues `StandardError` per-action and continues to the next action; it does not re-raise. A silently-failing action (e.g. an agent id that no longer belongs to the inbox) will show up only in exception tracking, not as a job failure or user-facing error.
- `assign_agent` in `Macros::ExecutionService` intercepts the special `'self'` sentinel (assign to the executing user) before delegating to `ActionService#assign_agent`; `AutomationRules::ActionService` has no such override since automation rules have no "current agent" concept.
- The three action methods that touch messages/attachments (`add_private_note`, `send_message`, `send_attachment`) all explicitly `@conversation.reload` before building the message — comment in the code notes this is to ensure the conversation object reflects the latest state, since multiple actions in the same run can mutate it in between.
- `send_attachment` is a no-op unless `@macro.files.attached?` is true and the given `blob_ids` resolve to real `ActiveStorage::Blob` records — files must already be attached to the macro itself (uploaded at macro-creation/update time via `AttachmentConcern`), not passed ad hoc at execution time.
- Both `tweet`-type conversations (`conversation_a_tweet?`, inherited from `ActionService`) block message-sending actions (`send_message`, `add_private_note`, `send_attachment`) — a channel-specific guard baked into the shared base class, not macro-specific logic.
- `MacrosExecutionJob` resolves conversations by `display_id`, not primary-key `id` — matches the id shown in the UI/URL, not the DB id.
