---
title: "User Preferences & UI Settings"
tags: [chatwoot, backend, users, preferences]
generated: 2026-08-17
deepwiki_section: "Configuration and Feature Management"
---

# User Preferences & UI Settings

## Purpose

How per-user preferences persist in Chatwoot. There are four distinct storage locations, each with different scoping:

| Store | Scope | Contents |
| --- | --- | --- |
| `users.ui_settings` (jsonb) | Global per user | Free-form UI-state bag: dashboard locale, font size, sidebar layout/order, per-channel signature & quoted-reply toggles, audio alerts, editor hotkey, dismissed banners, Copilot/Captain UI state |
| `users.message_signature` (text), `users.custom_attributes` (jsonb), `users.display_name` | Global per user | Reply signature body; profile custom attrs (only `phone_number` is writable via API); display name |
| `account_users.availability` / `auto_offline` / `active_at` | Per user **per account** | Availability enum (`online: 0, offline: 1, busy: 2`), auto-offline flag (default `true`), last-active-account timestamp |
| `notification_settings` table | Per user **per account** | Email + push notification preferences as two integer bitmasks (`email_flags`, `push_flags`) |

The backend imposes no schema on `ui_settings` — it is a client-owned dictionary; the server only reads one key (`locale`).

## Key Files & Classes

Backend:

- `/Users/sharma/Downloads/workspace/chatwoot/app/models/user.rb` — schema shows `ui_settings :jsonb`, `custom_attributes :jsonb`, `message_signature :text`, and a **deprecated** `availability` enum on users (comment at line 70: "remove in a future version once online status is moved to account users" — the live value is on `account_users`).
- `/Users/sharma/Downloads/workspace/chatwoot/app/controllers/api/v1/profiles_controller.rb` — the single write path for everything user-global. `profile_params` permits `ui_settings: {}` (arbitrary hash), `message_signature`, `display_name`, etc.; `custom_attributes_params` permits only `:phone_number` and is `merge!`d (not replaced). Member actions `availability` and `auto_offline` update the matching `account_users` row (`find_by!(account_id:)`); `set_active_account` stamps `account_users.active_at`.
- `/Users/sharma/Downloads/workspace/chatwoot/app/models/notification_setting.rb` — FlagShihTzu bitmask model. `EMAIL_NOTIFICATION_FLAGS` / `PUSH_NOTIFICATION_FLAGS` are generated from `Notification::NOTIFICATION_TYPES` (8 types in `app/models/notification.rb`: conversation_creation, conversation_assignment, assigned_conversation_new_message, conversation_mention, participating_conversation_new_message, 3× SLA-missed) prefixed `email_` / `push_`.
- `/Users/sharma/Downloads/workspace/chatwoot/app/controllers/api/v1/accounts/notification_settings_controller.rb` — show/update via `selected_email_flags` / `selected_push_flags` string arrays (FlagShihTzu setters).
- `/Users/sharma/Downloads/workspace/chatwoot/app/models/account_user.rb` — `after_create_commit :create_notification_setting` seeds defaults (`email_conversation_assignment`, `push_conversation_assignment`); `after_save :update_presence_in_redis` pushes availability into `OnlineStatusTracker`.
- `/Users/sharma/Downloads/workspace/chatwoot/app/models/concerns/availability_statusable.rb` — `auto_offline: true` derives status from Redis presence (falls back to stored availability when present, `offline` when not); `auto_offline: false` makes the manually chosen availability stick regardless of presence.
- `/Users/sharma/Downloads/workspace/chatwoot/app/models/concerns/user_attribute_helpers.rb` — `availability_status`, `auto_offline`, `active_account_user` (orders by `active_at DESC NULLS LAST`) resolve per-account values through `Current.account`.
- `/Users/sharma/Downloads/workspace/chatwoot/app/controllers/concerns/switch_locale.rb` — the only backend *reader* of `ui_settings`: `locale_from_user` returns `@user.ui_settings&.dig('locale')`, taking priority over account locale in `switch_locale_using_account_locale`.
- `/Users/sharma/Downloads/workspace/chatwoot/app/views/api/v1/models/_user.json.jbuilder` — serializes `message_signature`, `custom_attributes` (only when present), `ui_settings` back to the client.
- Routes: `config/routes.rb` ~line 451 — `resource :profile` (unscoped, `/api/v1/profile`) with member `availability` / `auto_offline` / `set_active_account`; account-scoped `resource :notification_settings, only: [:show, :update]` (~line 324).

Frontend:

- `/Users/sharma/Downloads/workspace/chatwoot/app/javascript/dashboard/composables/useUISettings.js` — the canonical accessor. Exposes `uiSettings` (auth-store getter), `updateUISettings(partial)` (merges partial over the full current object before dispatch), plus helpers: sidebar item order (with defaults `DEFAULT_CONVERSATION_SIDEBAR_ITEMS_ORDER` / `DEFAULT_CONTACT_SIDEBAR_ITEMS_ORDER`), per-channel keys `${slugified_channel}_signature_enabled` / `${slugified_channel}_quoted_reply_enabled`, and `isEditorHotKeyEnabled` (`editor_message_key`, legacy `enter_to_send_enabled`).
- `/Users/sharma/Downloads/workspace/chatwoot/app/javascript/dashboard/store/modules/auth.js` — `updateUISettings` action commits `SET_CURRENT_USER_UI_SETTINGS` **optimistically first**, then calls the API — but *skips the API call entirely while impersonating* (SessionStorage `IMPERSONATION_USER` guard) and silently swallows errors. `updateAvailability` / `updateAutoOffline` are optimistic-with-revert.
- `/Users/sharma/Downloads/workspace/chatwoot/app/javascript/dashboard/api/auth.js` — `updateUISettings` issues `PUT /api/v1/profile` with `{ profile: { ui_settings } }`.
- `/Users/sharma/Downloads/workspace/chatwoot/app/javascript/dashboard/store/modules/userNotificationSettings.js` + `api/userNotificationSettings.js` — separate store module for the bitmask prefs.
- `/Users/sharma/Downloads/workspace/chatwoot/app/javascript/dashboard/helper/scriptHelpers.js` — `initializeAudioAlerts` reads `enable_audio_alerts`, `always_play_audio_alert`, `alert_if_unread_assigned_conversation_exist`, `notification_tone` from `ui_settings`.
- `/Users/sharma/Downloads/workspace/chatwoot/app/javascript/dashboard/composables/useFontSize.js` — persists `font_size`.
- `/Users/sharma/Downloads/workspace/chatwoot/app/javascript/dashboard/routes/dashboard/settings/profile/UserLanguageSelect.vue` — writes `locale` into `ui_settings`; writes `locale: null` to fall back to the account locale.

## How It Fits Together

**ui_settings round-trip.** Any component calls `useUISettings().updateUISettings({ some_key: value })` → composable spreads the *entire* current settings object plus the partial → auth-store action optimistically merges into `currentUser.ui_settings` and PUTs the full object to `ProfilesController#update` → `assign_attributes` replaces the jsonb column wholesale → response re-hydrates `currentUser` via `_user.json.jbuilder`. Consequences: last-writer-wins across browser tabs (whole-object replace, no per-key patch), failures are invisible to the user (errors ignored), and during super-admin impersonation the settings mutate only in-memory, never persisting to the impersonated user.

**Key namespace.** Keys observed in code (sampled, not exhaustive — ~40 dashboard files touch `uiSettings`): `locale`, `font_size`, `conversation_sidebar_items_order`, `contact_sidebar_items_order`, `conversation_display_type`, `sidebar_width`, `contacts_sort_by`, `is_contact_sidebar_open` / `is_ct_labels_open`-style open-state booleans (via `toggleSidebarUIState`), `editor_message_key` / `enter_to_send_enabled`, `${channel}_signature_enabled`, `${channel}_quoted_reply_enabled`, audio-alert keys (above), `changelog_dismissed_slugs`, `last_active_portal_slug`, `last_active_locale_code`, `is_copilot_panel_open`, `preferred_captain_assistant_id`, `show_*_suggestions` (Captain).

**Signature is two pieces.** The signature *body* lives in `users.message_signature` (edited in Profile settings, saved via the same profile endpoint). Whether it is appended lives in `ui_settings["${channel}_signature_enabled"]` — per channel type, toggled from ReplyBox (`sendWithSignature` in `app/javascript/dashboard/components/widgets/conversation/ReplyBox.vue`).

**Availability & auto-offline** are per-account (`account_users`), not global. `POST /api/v1/profile/availability` and `/auto_offline` carry an `account_id` and update that row; saving availability syncs Redis via `OnlineStatusTracker.set_status`. Read-side, `AvailabilityStatusable#user_availability_status` means: auto-offline on → Redis presence decides (websocket-driven); auto-offline off → the manual enum sticks even when the user disconnects. The `users.availability` column still exists but is legacy.

**Notification settings** are created automatically when a user joins an account (`AccountUser` callback — see [[account-onboarding]] for the join flow) with conversation-assignment defaults, and edited via the account-scoped controller. The bitmask flag names must stay in lock-step with `Notification::NOTIFICATION_TYPES` — adding a notification type implicitly adds `email_*`/`push_*` flags. Delivery-side consumption of these flags is covered in [[notifications]].

**Locale precedence** (dashboard/mailers using `switch_locale_using_account_locale`): user `ui_settings['locale']` → account locale → `DEFAULT_LOCALE` env, validated against `I18n.available_locales` with a `pt_BR`→`pt`-style variant fallback.

## Product Behavior

- Profile settings page (name, display name, email, password, avatar, signature, audio alerts, hotkey, language) all funnel into `PUT /api/v1/profile`.
- The user-level language choice overrides the account language everywhere the user is the request subject, including emails rendered with the user in scope; choosing "account default" stores `locale: null`.
- Availability picker and the "Mark offline automatically" toggle are per-account settings; agents switching accounts get independent statuses. Presence itself (online dot) is Redis-backed and websocket-driven, so with auto-offline on, closing the browser drops the agent to offline.
- Notification preferences are a matrix of 8 event types × {email, push} per account.
- UI-state persistence (sidebar order/open-state, font size, chat-list display, dismissed changelog cards, Copilot panel) follows the user across devices because it lives server-side, not in localStorage.

## Notes for AI Agents

- `ui_settings` has **no backend validation** — `permit(ui_settings: {})` accepts any nested hash. Do not search for a schema or defaults on the Ruby side; defaults live scattered in frontend consumers (e.g. `DEFAULT_CONVERSATION_SIDEBAR_ITEMS_ORDER` in `useUISettings.js`).
- Never write `ui_settings` keys directly through the store mutation; go through `useUISettings().updateUISettings` so the full-object merge happens. A partial-object PUT would wipe every other preference (whole-column replace).
- Availability bugs: check `account_users`, not `users` — the `users.availability` column is a decoy (deprecated per the TODO in user.rb).
- `updateUISettings` failures are silently swallowed, and impersonation sessions never persist — "my setting didn't save" reports may be either of these.
- User `custom_attributes` writes via the profile API are restricted to `phone_number` and merged, unlike account/contact custom attributes which have definition models.
- Sampled: all backend readers/writers of the four stores, the auth store module, `useUISettings`, and a sample of frontend key consumers. Skipped: individual Vue components consuming `uiSettings` (~40 files), push-subscription endpoints (`notification_subscriptions`), and MFA/session sub-resources under the profile route.

## Related

- [[models]] — User, AccountUser, Notification schema context
- [[notifications]] — how `email_flags` / `push_flags` gate actual delivery
- [[api-v1-controllers]] — ProfilesController and account-scoped controller conventions
- [[dashboard-store]] — auth and userNotificationSettings Vuex modules
- [[composables-mixins-helpers]] — `useUISettings`, `useFontSize`
- [[account-onboarding]] — AccountUser creation seeding notification defaults
- [[events-listeners]] — presence/availability event dispatch (`AGENT_ADDED`, Redis presence)
- [[glossary]]
