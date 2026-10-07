# Paper Layer demo-video account (local development only).
# Run from the repo root:  bundle exec rails runner .claude/skills/demo-video/scripts/seed_paper_layer.rb
#   RESET=1  deletes the existing Paper Layer account first and builds it again.
#
# Creates its OWN account so video takes never disturb account 1 (docs-screenshots data).
# Writes the host login to ~/.config/chatwoot-video/env (CW_EMAIL, CW_PASSWORD, CW_ACCOUNT_ID).
# No outbound calls: channels that would contact Meta/Telegram/Twilio on create are inserted directly,
# jobs are not run, and voice is enabled with a placeholder TwiML app id so Twilio provisioning is skipped.
# Cast and avatars: Sojan's Paper Layer world (assets/avatars). Domain: paperlayer.com.
# rubocop:disable all
raise 'Local development only' unless Rails.env.development?

require 'faker'
ActiveJob::Base.queue_adapter = :test
Faker::Config.random = Random.new(7)
srand(7)

SKILL = File.expand_path('..', __dir__)
AVATARS = File.join(SKILL, 'assets/avatars')
ENV_FILE = File.expand_path('~/.config/chatwoot-video/env')
NOW = Time.zone.now

def step(name)
  print "#{name}... "
  yield
  puts 'ok'
end

def avatar(record, slug)
  path = File.join(AVATARS, "#{slug}.jpg")
  record.avatar.attach(io: File.open(path), filename: "#{slug}.jpg", content_type: 'image/jpeg') if File.exist?(path)
end

# ---------- account ----------
# Deletes every row of an account with plain SQL. Account#destroy cascades through background jobs (not run here)
# and would call Meta/Telegram/Twilio teardown hooks with fake tokens; direct deletes avoid both.
def purge_account(id)
  conn = ActiveRecord::Base.connection
  inbox_ids = Inbox.where(account_id: id).pluck(:id)
  ContactInbox.where(inbox_id: inbox_ids).delete_all
  InboxMember.where(inbox_id: inbox_ids).delete_all
  TeamMember.where(team_id: Team.where(account_id: id).select(:id)).delete_all
  tables = conn.tables.select { |t| conn.column_exists?(t, :account_id) } - ['accounts']
  5.times do # children before parents; a few passes settle any foreign keys
    left = tables.select do |t|
      conn.execute("DELETE FROM #{conn.quote_table_name(t)} WHERE account_id = #{id.to_i}")
      false
    rescue ActiveRecord::InvalidForeignKey
      true
    end
    break if left.empty?
  end
  Account.where(id: id).delete_all
end

Account.where(name: 'Paper Layer').find_each do |old|
  abort "Paper Layer account already exists (id #{old.id}). Run with RESET=1 to rebuild it." unless ENV['RESET']
  step("Deleting old Paper Layer account #{old.id}") { purge_account(old.id) }
end
exit if ENV['PURGE_ONLY'] # used to clean up after a failed run

ACCOUNT = Account.create!(name: 'Paper Layer', locale: 'en', domain: 'paperlayer.com', support_email: 'support@paperlayer.com')
ACCOUNT.enable_features!(*%w[sla channel_voice advanced_assignment message_reply_to inbox_view])
puts "Account #{ACCOUNT.id} created"

# ---------- people ----------
password = "Pl!#{SecureRandom.hex(6)}aA9"
AGENTS = {}
step('Agents') do
  [['maya-chen', 'Maya Chen', :administrator], ['matthew-cruz', 'Matthew Cruz', :agent],
   ['anika-rao', 'Anika Rao', :agent], ['priya-shah', 'Priya Shah', :agent]].each do |slug, name, role|
    email = "#{slug.tr('-', '.')}@paperlayer.com"
    user = User.find_by(email: email) || User.new(email: email)
    # ui_settings reset: panels and accordions start closed in every take (Chatwoot remembers them per user).
    user.assign_attributes(name: name, display_name: name.split.first, password: password, password_confirmation: password, ui_settings: {})
    user.skip_confirmation!
    user.save!
    avatar(user, slug)
    AccountUser.create!(account: ACCOUNT, user: user, role: role, availability: :online)
    AGENTS[slug.split('-').first.to_sym] = user
  end
end
MAYA, MATTHEW, ANIKA, PRIYA = AGENTS.values_at(:maya, :matthew, :anika, :priya)

step('Teams + labels') do
  { 'Support' => [MAYA, MATTHEW, PRIYA], 'Ops' => [MATTHEW, ANIKA], 'Billing' => [ANIKA], 'Sales' => [PRIYA, MAYA],
    'Spanish support' => [MATTHEW, PRIYA] }.each do |name, members|
    team = ACCOUNT.teams.create!(name: name, allow_auto_assign: true)
    members.each { |u| TeamMember.create!(team: team, user: u) }
  end
  { 'delivery' => '#1F93FF', 'billing' => '#7E5BDC', 'returns' => '#E5484D', 'wholesale' => '#12946A', 'onboarding' => '#F7C445',
    'custom-print' => '#C98A1B', 'priority-care' => '#E5484D', 'feedback' => '#5E9FF3' }.each do |title, color|
    ACCOUNT.labels.create!(title: title, color: color, show_on_sidebar: true)
  end
end
# Team names are stored lowercased; find_by! so a typo fails instead of leaving a conversation without a team.
def team(name) = ACCOUNT.teams.find_by!(name: name.downcase)

# ---------- inboxes ----------
def insert_channel(klass, attrs)
  row = klass.insert({ account_id: ACCOUNT.id, created_at: NOW, updated_at: NOW, **attrs }, returning: %w[id])
  klass.find(row.first['id'])
end

INBOX = {}
step('Inboxes (website, email, WhatsApp, Instagram, Messenger, SMS, Telegram, phone)') do
  web = Channel::WebWidget.create!(account: ACCOUNT, website_url: 'https://paperlayer.com', widget_color: '#1F93FF',
                                   welcome_title: 'Hi there!', welcome_tagline: 'We usually reply in a few minutes.')
  INBOX[:web] = Inbox.create!(account: ACCOUNT, channel: web, name: 'Website')
  email = Channel::Email.create!(account: ACCOUNT, email: 'support@paperlayer.com')
  INBOX[:email] = Inbox.create!(account: ACCOUNT, channel: email, name: 'Email')
  INBOX[:whatsapp] = Inbox.create!(account: ACCOUNT, name: 'WhatsApp',
                                   channel: insert_channel(Channel::Whatsapp, phone_number: '+14155550188', provider: 'whatsapp_cloud',
                                                                              provider_config: {}))
  INBOX[:instagram] = Inbox.create!(account: ACCOUNT, name: '@paperlayer',
                                    channel: insert_channel(Channel::Instagram, access_token: SecureRandom.hex,
                                                                                instagram_id: rand(10**16..10**17).to_s, expires_at: 60.days.from_now))
  INBOX[:messenger] = Inbox.create!(account: ACCOUNT, name: 'Messenger',
                                    channel: insert_channel(Channel::FacebookPage, page_id: rand(10**14..10**15).to_s,
                                                                                   user_access_token: SecureRandom.hex, page_access_token: SecureRandom.hex))
  INBOX[:sms] = Inbox.create!(account: ACCOUNT, name: 'SMS',
                              channel: Channel::Sms.create!(account: ACCOUNT, phone_number: '+14155550142'))
  INBOX[:telegram] = Inbox.create!(account: ACCOUNT, name: 'Telegram',
                                   channel: insert_channel(Channel::Telegram, bot_name: 'PaperLayerBot', bot_token: SecureRandom.hex))
  # Voice: a Twilio number with calling on. A placeholder TwiML app id skips Twilio provisioning.
  phone = Channel::TwilioSms.create!(account: ACCOUNT, account_sid: "AC#{SecureRandom.hex(16)}", auth_token: SecureRandom.hex(16),
                                     phone_number: '+14155550199', medium: :sms, voice_enabled: true,
                                     twiml_app_sid: "AP#{SecureRandom.hex(16)}",
                                     provider_config: { 'recording_enabled' => true, 'transcription_enabled' => true })
  INBOX[:phone] = Inbox.create!(account: ACCOUNT, channel: phone, name: 'Phone')
  # "Build your own channel with our API": an API inbox fed by the customer portal.
  INBOX[:api] = Inbox.create!(account: ACCOUNT, channel: Channel::Api.create!(account: ACCOUNT), name: 'Customer portal')
  INBOX.each_value { |i| AGENTS.each_value { |u| InboxMember.create!(inbox: i, user: u) } }
end

# ---------- custom attributes ----------
step('Custom attributes') do
  [['Severity', 'severity', :list, :conversation_attribute, %w[P1 P2 P3]],
   ['Order ID', 'order_id', :text, :conversation_attribute, []],
   ['Plan', 'plan', :list, :contact_attribute, %w[Starter Studio Business]],
   ['Lifetime value', 'lifetime_value', :currency, :contact_attribute, []],
   ['Customer since', 'customer_since', :date, :contact_attribute, []]].each do |name, key, type, model, values|
    CustomAttributeDefinition.create!(account: ACCOUNT, attribute_display_name: name, attribute_key: key,
                                      attribute_display_type: type, attribute_model: model, attribute_values: values)
  end
end

# ---------- contacts ----------
CONTACTS = {}
step('Contacts + companies') do
  people = [
    ['emma-wilson', 'Emma Wilson', 'Founder', 'Northstar Studio', 'northstarstudio.com', 'Portland', 'Studio'],
    ['marcus-reed', 'Marcus Reed', 'Operations manager', 'Riverbend Retail', 'riverbendretail.com', 'Austin', 'Business'],
    ['daniel-kim', 'Daniel Kim', 'Systems lead', 'Lumen Trails', 'lumentrails.com', 'Denver', 'Business'],
    ['sofia-patel', 'Sofia Patel', 'Finance manager', 'Atelier Nine', 'ateliernine.com', 'San Francisco', 'Business'],
    ['priya-menon', 'Priya Menon', 'Operations coordinator', 'Morning Market', 'morningmarket.com', 'Oakland', 'Studio'],
    ['ava-brooks', 'Ava Brooks', 'Account owner', 'Northstar Studio', 'northstarstudio.com', 'Portland', 'Studio'],
    ['noah-singh', 'Noah Singh', 'Billing owner', 'Atelier Nine', 'ateliernine.com', 'San Francisco', 'Business'],
    ['oliver-grant', 'Oliver Grant', 'Returns specialist', 'Riverbend Retail', 'riverbendretail.com', 'Austin', 'Business'],
    ['mia-chen', 'Mia Chen', 'Workspace admin', 'Lumen Trails', 'lumentrails.com', 'Denver', 'Starter']
  ]
  people.each_with_index do |(slug, name, role, company, domain, city, plan), i|
    co = Company.find_or_create_by!(account: ACCOUNT, domain: domain) { |c| c.name = company }
    contact = ACCOUNT.contacts.create!(
      name: name, email: "#{slug.split('-').first}@#{domain}", phone_number: format('+1415555%04d', 2100 + i * 37), company_id: co.id,
      additional_attributes: { 'company_name' => company, 'city' => city, 'country' => 'United States', 'country_code' => 'US', 'description' => role },
      custom_attributes: { 'plan' => plan, 'lifetime_value' => rand(900..24_000), 'customer_since' => (NOW - rand(200..1100).days).to_date.to_s }
    )
    avatar(contact, slug)
    CONTACTS[slug.split('-').first.to_sym] = contact
  end
  # A Spanish-speaking website visitor for the routing automation.
  CONTACTS[:lucia] = ACCOUNT.contacts.create!(name: 'Lucía Fernández', email: 'lucia@casapapel.mx', phone_number: '+525512345678',
                                              additional_attributes: { 'city' => 'Mexico City', 'country' => 'Mexico', 'country_code' => 'MX' })
  # Older customers for history only (initials avatars are fine; they are not on screen in the tour).
  30.times do
    n = Faker::Name.name
    ACCOUNT.contacts.create!(name: n, email: "#{n.parameterize(separator: '.')}@#{Faker::Internet.domain_name}")
  end
end

# ---------- conversations ----------
def source_for(inbox, contact)
  phone = contact.phone_number.presence || format('+1628555%04d', rand(10_000))
  case inbox.channel_type
  when 'Channel::Email' then contact.email
  when 'Channel::Whatsapp' then phone.delete('+')
  when 'Channel::Sms', 'Channel::TwilioSms' then phone
  else SecureRandom.hex
  end
end

def activity(conv, text, at)
  conv.messages.create!(account: ACCOUNT, inbox: conv.inbox, message_type: :activity, content: text, created_at: at, updated_at: at)
end

# lines: [[:in | :out | :note, text, minutes_ago, author?]]
def conversation(contact:, inbox:, lines:, assignee: nil, team: nil, labels: [], status: :open, priority: nil, attrs: {}, extra: {})
  ci = inbox.contact_inboxes.find_by(contact: contact) || inbox.contact_inboxes.create!(contact: contact, source_id: source_for(inbox, contact))
  start = NOW - lines.first[2].minutes
  conv = Conversation.create!(account: ACCOUNT, inbox: inbox, contact: contact, contact_inbox: ci, assignee: assignee, team: team,
                              priority: priority, custom_attributes: attrs, additional_attributes: extra, created_at: start, updated_at: start)
  lines.each do |kind, text, ago, author|
    at = NOW - ago.minutes
    if kind == :activity
      activity(conv, text, at)
      next
    end
    conv.messages.create!(account: ACCOUNT, inbox: inbox, content: text, created_at: at, updated_at: at,
                          message_type: kind == :in ? :incoming : :outgoing, private: kind == :note,
                          sender: kind == :in ? contact : (author || assignee || MAYA),
                          status: kind == :out ? :read : :sent, source_id: kind == :out ? "pl-#{SecureRandom.hex(6)}" : nil)
  end
  conv.update_labels(labels) if labels.any?
  last = NOW - lines.last[2].minutes
  conv.update_columns(status: Conversation.statuses[status], last_activity_at: last, updated_at: last,
                      agent_last_seen_at: last, contact_last_seen_at: last)
  conv
end

# Short, realistic threads for the live queue. [contact, inbox, assignee, team, labels, priority, lines]
QUEUE = [
  [:emma, :web, nil, nil, %w[custom-print], nil,
   [[:in, 'Hi! Can we get our logo foil-stamped on the kraft notebooks? Looking at 300 units.', 9]]],
  [:daniel, :whatsapp, :matthew, 'Support', %w[delivery], 'high',
   [[:in, 'Tracking for PL-48377 has not moved since Monday.', 48], [:out, 'Checking with the carrier now, Daniel.', 41],
    [:in, 'Thanks. We need it before Friday for an event.', 12]]],
  [:priya, :instagram, :priya, 'Sales', %w[wholesale], nil,
   [[:in, 'Love the new linen planners! Do you do wholesale for cafes?', 66], [:out, 'We do! What volume are you thinking?', 58],
    [:in, 'Around 40 a month across two locations.', 23]]],
  [:sofia, :email, :anika, 'Billing', %w[billing], 'medium',
   [[:in, 'Could you resend the September invoice with our new VAT number?', 130], [:out, 'Of course. Updating it now.', 121],
    [:in, 'Great, the new number is US-48-2210931.', 34]]],
  [:noah, :messenger, nil, nil, [], nil,
   [[:in, 'Is the holiday gift box still available in sage green?', 15]]],
  [:ava, :web, :maya, 'Support', %w[onboarding], nil,
   [[:in, 'We just added 6 people to our workspace. How do they see past orders?', 95], [:out, 'Great question, everyone on the account can open Orders.', 88],
    [:in, 'Perfect, and can they reorder too?', 27]]],
  [:oliver, :sms, :anika, 'Ops', %w[returns], nil,
   [[:in, 'Return label for RMA-2291 please.', 54], [:out, 'Sent to your email just now.', 47], [:in, 'Got it, thanks!', 44]]],
  [:mia, :telegram, nil, nil, [], 'low',
   [[:in, 'Can I change the shipping address on PL-48601?', 6]]],
  [:emma, :email, :priya, 'Sales', %w[wholesale custom-print], 'medium',
   [[:in, 'Following up on the proof for the Northstar launch kits.', 210], [:out, 'Proof attached, take a look when you can.', 190],
    [:in, 'Looks great. One tweak: can the ribbon be navy?', 70]]]
]

step('Live queue') do
  QUEUE.each do |c, ib, a, t, labels, prio, lines|
    conversation(contact: CONTACTS[c], inbox: INBOX[ib], assignee: a && AGENTS[a], team: t && team(t), labels: labels, priority: prio, lines: lines)
  end
end

step('Hero conversation (WhatsApp, damaged order)') do
  m = CONTACTS[:marcus]
  hero = conversation(
    contact: m, inbox: INBOX[:whatsapp], assignee: MATTHEW, team: team('Ops'), labels: %w[delivery priority-care], priority: 'high',
    attrs: { 'order_id' => 'PL-48213' },
    lines: [
      [:in, 'Hi, our order PL-48213 arrived this morning and two cartons are crushed. The gift boxes inside are bent.', 42],
      [:activity, 'Assigned to Matthew Cruz by Maya Chen', 40],
      [:activity, 'Assigned to Ops by Maya Chen', 40],
      [:activity, 'Maya Chen added delivery, priority-care', 39],
      [:out, 'Sorry about that, Marcus! Could you send a photo of the cartons so we can file the carrier claim?', 36],
      [:in, 'Sure, sending now. We have a store opening on Saturday, so we really need replacements.', 31],
      [:out, 'Thanks, got the photos. I am checking stock for an express replacement.', 24],
      [:in, 'Any update? Saturday is close.', 11]
    ])
  sla = SlaPolicy.create!(account: ACCOUNT, name: 'Priority care', description: 'Reply within 1 hour, resolve within 1 day.',
                          first_response_time_threshold: 15.minutes.to_i, next_response_time_threshold: 1.hour.to_i,
                          resolution_time_threshold: 24.hours.to_i)
  SlaPolicy.create!(account: ACCOUNT, name: 'Standard', description: 'Reply within 4 business hours.', first_response_time_threshold: 4.hours.to_i,
                    next_response_time_threshold: 8.hours.to_i, resolution_time_threshold: 48.hours.to_i, only_during_business_hours: true)
  AppliedSla.create!(account: ACCOUNT, conversation: hero, sla_policy: sla, sla_status: :active, created_at: hero.created_at)
  hero.update_columns(sla_policy_id: sla.id)
  activity(hero, 'Maya Chen added SLA policy Priority care', NOW - 39.minutes)
  hero.update_columns(last_activity_at: NOW - 11.minutes)
  # Contact context: notes, labels and past conversations.
  [[MAYA, 'Runs ops for 4 Riverbend stores. Prefers WhatsApp over email.', 300],
   [ANIKA, 'Net 30 terms approved in March. Invoices go to ap@riverbendretail.com.', 200]].each do |user, text, days|
    Note.create!(account: ACCOUNT, contact: m, user: user, content: text, created_at: NOW - days.days)
  end
  m.update_labels(%w[wholesale priority-care])
end

step('Contact history (past conversations, resolved)') do
  past = [
    ['Can we switch our monthly reorder to biweekly?', 'Done, the next delivery is on the 14th.', %w[wholesale]],
    ['Invoice INV-2207 shows the wrong store address.', 'Fixed and resent, sorry about that.', %w[billing]],
    ['Do you have recycled tissue paper in bulk?', 'Yes, 500-sheet packs. Adding a sample to your next order.', %w[wholesale]]
  ]
  CONTACTS.except(:lucia).each_value.with_index do |contact, i|
    past.sample(i.zero? ? 3 : rand(1..3)).each_with_index do |(q, a, labels), j|
      ago = (20 + i * 9 + j * 23) * 24 * 60
      conversation(contact: contact, inbox: INBOX.values_at(:web, :email, :whatsapp).sample, assignee: AGENTS.values.sample,
                   labels: labels, status: :resolved, lines: [[:in, q, ago], [:out, a, ago - 25]])
    end
  end
  others = ACCOUNT.contacts.where.not(id: CONTACTS.values.map(&:id)).to_a
  80.times do
    ago = rand(2..60) * 24 * 60 + rand(0..600)
    q, a, labels = past.sample
    conversation(contact: others.sample, inbox: INBOX.values_at(:web, :web, :email, :whatsapp, :instagram, :messenger, :sms).sample,
                 assignee: AGENTS.values.sample, labels: labels, status: :resolved, lines: [[:in, q, ago], [:out, a, ago - rand(8..90)]])
  end
end

step('Severity values (filter + folder have results)') do
  open = ACCOUNT.conversations.where(status: :open).where.not(assignee_id: nil).order(:id).to_a
  open.each_with_index { |c, i| c.update_columns(custom_attributes: c.custom_attributes.merge('severity' => %w[P1 P2 P3 P2][i % 4])) }
  # The hero conversation starts without a severity: the video sets it on screen.
  ACCOUNT.conversations.where("custom_attributes->>'order_id' = 'PL-48213'").each do |c|
    c.update_columns(custom_attributes: c.custom_attributes.except('severity'))
  end
end

# ---------- voice ----------
step('Voice calls (recording + transcript)') do
  sofia = CONTACTS[:sofia]
  lines = [
    ['Sofia', 'Hi, this is Sofia from Atelier Nine. Our gift boxes for the gala are still showing as processing.'],
    ['Anika', 'Hi Sofia, I can see the order. The foil stamping finished this morning, so it ships today by express.'],
    ['Sofia', 'Great. Will it arrive by Thursday?'],
    ['Anika', 'Yes, Thursday before noon. I will text you the tracking link as soon as it ships.'],
    ['Sofia', 'Perfect, thank you!']
  ]
  # A listenable recording: two macOS voices reading the transcript.
  require 'tmpdir'
  mp3 = File.join(Dir.tmpdir, "paperlayer-call-#{SecureRandom.hex(3)}.mp3")
  Dir.mktmpdir do |dir|
    parts = lines.each_with_index.map do |(who, text), i|
      f = File.join(dir, format('%02d.aiff', i))
      system('say', '-v', who == 'Sofia' ? 'Karen' : 'Moira', '-o', f, text, exception: true)
      f
    end
    list = File.join(dir, 'list.txt')
    File.write(list, parts.map { |p| "file '#{p}'\n" }.join)
    system('ffmpeg', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list, '-ac', '1', '-b:a', '64k', mp3, exception: true)
  end
  duration = `ffprobe -v error -show_entries format=duration -of csv=p=0 "#{mp3}"`.to_f.round

  ci = INBOX[:phone].contact_inboxes.create!(contact: sofia, source_id: sofia.phone_number)
  conv = Conversation.create!(account: ACCOUNT, inbox: INBOX[:phone], contact: sofia, contact_inbox: ci, assignee: ANIKA, team: team('Ops'),
                              created_at: NOW - 26.minutes)
  calls = [[:incoming, 26, ANIKA, duration, lines.map { |w, t| "#{w}: #{t}" }.join("\n")]]
  calls.each do |direction, ago, agent, secs, transcript|
    at = NOW - ago.minutes
    call = Call.create!(account: ACCOUNT, inbox: INBOX[:phone], conversation: conv, contact: sofia, provider: :twilio, direction: direction,
                        status: 'completed', provider_call_id: "CA#{SecureRandom.hex(16)}", accepted_by_agent: agent, started_at: at,
                        duration_seconds: secs, transcript: transcript, created_at: at,
                        meta: { 'initiated_at' => at.to_i, 'ended_at' => (at + secs.seconds).to_i })
    call.recording.attach(io: File.open(mp3), filename: 'call-recording.mp3', content_type: 'audio/mpeg')
    builder = Voice::CallMessageBuilder.new(call)
    msg = builder.perform!
    call.update!(message_id: msg.id)
    builder.update_status!(status: 'completed', agent: agent, duration_seconds: secs)
    msg.update_columns(created_at: at, updated_at: at)
  end
  conv.messages.create!(account: ACCOUNT, inbox: INBOX[:phone], message_type: :outgoing, sender: ANIKA, status: :read,
                        source_id: "SM#{SecureRandom.hex(8)}", created_at: NOW - 19.minutes, updated_at: NOW - 19.minutes,
                        content: 'Your Atelier Nine gift boxes have shipped: track.paperlayer.com/PL-48655')
  conv.update_columns(last_activity_at: NOW - 19.minutes)
  File.delete(mp3)
end

# ---------- assignment ----------
step('Assignment policy + agent capacity') do
  policy = AssignmentPolicy.create!(account: ACCOUNT, name: 'Balanced round robin',
                                    description: 'Spread new conversations evenly across available agents.')
  INBOX.values_at(:web, :whatsapp, :instagram, :messenger, :email).each { |i| InboxAssignmentPolicy.create!(inbox: i, assignment_policy: policy) }
  cap = AgentCapacityPolicy.create!(account: ACCOUNT, name: 'Standard capacity', description: 'Up to 8 open chats per agent on each channel.')
  INBOX.values_at(:web, :whatsapp, :instagram, :email).each { |i| InboxCapacityLimit.create!(agent_capacity_policy: cap, inbox: i, conversation_limit: 8) }
  ACCOUNT.account_users.where(role: :agent).update_all(agent_capacity_policy_id: cap.id)
end

step('Automation rules') do
  AutomationRule.create!(account: ACCOUNT, name: 'Spanish visitors to Spanish support', event_name: 'conversation_created',
                         description: 'Website chats from Spanish browsers go straight to the Spanish-speaking team.',
                         conditions: [{ 'attribute_key' => 'browser_language', 'filter_operator' => 'equal_to', 'values' => ['es'], 'query_operator' => nil }],
                         actions: [{ 'action_name' => 'assign_team', 'action_params' => [team('Spanish support').id] }])
  AutomationRule.create!(account: ACCOUNT, name: 'Damaged orders are high priority', event_name: 'message_created',
                         description: 'Flag damaged-delivery reports so they reach the top of the queue.',
                         conditions: [{ 'attribute_key' => 'content', 'filter_operator' => 'contains', 'values' => ['damaged'], 'query_operator' => nil }],
                         actions: [{ 'action_name' => 'change_priority', 'action_params' => ['high'] }, { 'action_name' => 'add_label', 'action_params' => ['delivery'] }])
  # One chat the rule already routed, so the result is visible in the inbox.
  conversation(contact: CONTACTS[:lucia], inbox: INBOX[:web], team: team('Spanish support'), assignee: PRIYA,
               extra: { 'browser_language' => 'es', 'browser' => { 'browser_name' => 'Chrome', 'platform_name' => 'macOS' } },
               lines: [[:in, 'Hola, ¿hacen envíos de cajas personalizadas a México?', 18],
                       [:activity, 'Assigned to Spanish support by Automation System', 18],
                       [:out, '¡Hola Lucía! Sí, enviamos a México en 5 a 7 días hábiles.', 14, PRIYA]])
end

# ---------- campaigns ----------
step('Campaigns') do
  Campaign.create!(account: ACCOUNT, inbox: INBOX[:web], sender: PRIYA, title: 'Pricing page helper',
                   message: 'Comparing plans? I can help you pick the right kit for your team.',
                   trigger_rules: { 'url' => 'https://paperlayer.com/pricing', 'time_on_page' => 10 }, enabled: true)
  Campaign.create!(account: ACCOUNT, inbox: INBOX[:web], title: 'Custom print launch',
                   message: 'New: foil-stamped notebooks with your logo. Want a free proof?',
                   trigger_rules: { 'url' => 'https://paperlayer.com/custom/*', 'time_on_page' => 20 }, enabled: true)
  sms = Campaign.create!(account: ACCOUNT, inbox: INBOX[:sms], title: 'Holiday restock for wholesale customers',
                         message: 'Paper Layer: holiday gift boxes are back in stock. Reply YES and we will hold 50 for you.',
                         audience: [{ 'type' => 'Label', 'id' => ACCOUNT.labels.find_by(title: 'wholesale').id }], scheduled_at: NOW + 2.days)
  done = Campaign.create!(account: ACCOUNT, inbox: INBOX[:sms], title: 'Back-to-school bundles',
                          message: 'Paper Layer: back-to-school bundles are 20% off this week with code SCHOOL20.',
                          audience: [{ 'type' => 'Label', 'id' => ACCOUNT.labels.find_by(title: 'wholesale').id }], scheduled_at: NOW + 1.day)
  done.update_columns(campaign_status: Campaign.campaign_statuses[:completed], scheduled_at: NOW - 3.days)
  reply = conversation(contact: CONTACTS[:priya], inbox: INBOX[:sms], assignee: PRIYA, team: team('Sales'), labels: %w[wholesale],
                       lines: [[:out, done.message, 3 * 24 * 60, PRIYA], [:in, 'YES, please hold 50 bundles for Morning Market!', 3 * 24 * 60 - 40]])
  reply.update_columns(campaign_id: done.id)
end

# ---------- help center ----------
step('Help Center') do
  # 'paperlayer' is taken by the docs-screenshots portal in account 1; portal slugs are installation-wide.
  portal = Portal.create!(account: ACCOUNT, slug: 'paper-layer', name: 'Paper Layer Help Center', color: '#1F93FF',
                          page_title: 'Paper Layer Help Center', header_text: 'How can we help?', homepage_link: 'https://paperlayer.com',
                          channel_web_widget_id: INBOX[:web].channel_id, config: { 'allowed_locales' => %w[en es], 'default_locale' => 'en' })
  # The reply box offers "Insert article from Help Center" only for inboxes linked to a portal.
  INBOX.values_at(:web, :email).each { |i| i.update!(portal_id: portal.id) }
  cats = {
    'Getting started' => ['getting-started', 'Set up your workspace and place your first order.'],
    'Orders & delivery' => ['orders-delivery', 'Tracking, delivery times and changing orders.'],
    'Custom print' => ['custom-print', 'Logos, proofs and foil stamping.'],
    'Billing & invoices' => ['billing-invoices', 'Payments, refunds and invoices.']
  }.to_h { |name, (slug, desc)| [name, Category.create!(account: ACCOUNT, portal: portal, name: name, slug: slug, locale: 'en', description: desc)] }
  [
    ['Getting started', 'Invite your team', "Go to **Settings > Team** and invite colleagues by email. Everyone on the account can see and reorder past orders."],
    ['Getting started', 'Place your first order', "1. Browse the catalogue.\n2. Add items to your cart.\n3. Choose a delivery address and check out.\n\nOrders placed before 2pm PT ship the same day."],
    ['Orders & delivery', 'Track your order', 'Every order gets a tracking link by email and text once it ships. You can also track it from **Orders**.'],
    ['Orders & delivery', 'My order arrived damaged', 'Sorry about that! Send a photo of the cartons and items. We ship replacements by express at no cost, usually the same day.'],
    ['Orders & delivery', 'Delivery times', "| Method | Time |\n|---|---|\n| Standard | 3-5 business days |\n| Express | 1-2 business days |"],
    ['Custom print', 'How proofs work', 'We send a digital proof within one business day. Approve it or ask for changes; printing starts after approval.'],
    ['Custom print', 'Foil stamping options', 'Gold, silver, copper and navy foil are available on notebooks, gift boxes and cards.'],
    ['Billing & invoices', 'Download invoices', 'All invoices are under **Billing > Invoices** as PDFs.'],
    ['Billing & invoices', 'Refund policy', 'Unopened items can be returned within 30 days. Refunds appear in 5 to 7 business days.']
  ].each do |cat, title, content|
    Article.create!(account: ACCOUNT, portal: portal, category: cats[cat], title: title, content: content,
                    description: content.lines.first.delete('#*|').strip.truncate(140), author: [MAYA, ANIKA, PRIYA].sample,
                    status: :published, views: rand(60..2400), locale: 'en')
  end
end

# ---------- extend ----------
step('Canned responses, dashboard app, saved folder') do
  { 'damaged' => 'Sorry your order arrived damaged! Could you send a photo of the cartons so we can ship replacements?',
    'tracking' => 'You can track your order anytime at track.paperlayer.com with your order number.',
    'proof' => 'Your proof is attached. Reply with any changes, and printing starts once you approve it.' }.each do |code, text|
    ACCOUNT.canned_responses.create!(short_code: code, content: text)
  end
  # Served locally during recording (see the product-tour spec); stands in for an internal refund tool.
  DashboardApp.create!(account: ACCOUNT, user: MAYA, title: 'Refunds',
                       content: [{ 'type' => 'frame', 'url' => 'http://localhost:3099/refunds.html' }])
  CustomFilter.create!(account: ACCOUNT, user: MAYA, name: 'Priority care', filter_type: :conversation,
                       query: { 'payload' => [{ 'attribute_key' => 'labels', 'filter_operator' => 'equal_to', 'values' => ['priority-care'], 'query_operator' => nil }] })
end

# Agents have read everything except the brand-new, unassigned chats (those keep their unread badge, as in a real queue).
ACCOUNT.conversations.where.not(assignee_id: nil).update_all(agent_last_seen_at: NOW, assignee_last_seen_at: NOW)
# Website visitors are identity-verified (HMAC), so no "unverified contact" warning shows in conversation headers.
INBOX[:web].contact_inboxes.update_all(hmac_verified: true)

# ---------- login for the recorder ----------
FileUtils.mkdir_p(File.dirname(ENV_FILE))
kept = File.exist?(ENV_FILE) ? File.readlines(ENV_FILE).reject { |l| l.start_with?('CW_EMAIL=', 'CW_PASSWORD=', 'CW_ACCOUNT_ID=', 'CW_HERO_CONTACT_ID=') } : []
File.write(ENV_FILE, kept.join + "CW_EMAIL=#{MAYA.email}\nCW_PASSWORD=#{password}\nCW_ACCOUNT_ID=#{ACCOUNT.id}\n" \
                                 "CW_HERO_CONTACT_ID=#{CONTACTS[:marcus].id}\n")
File.chmod(0o600, ENV_FILE)

a = ACCOUNT.reload
puts "\nDone. account=#{a.id} inboxes=#{a.inboxes.count} conversations=#{a.conversations.count} " \
     "(#{a.conversations.reorder(nil).group(:status).count}) contacts=#{a.contacts.count}"
puts "Host login saved to #{ENV_FILE} (#{MAYA.email})."
