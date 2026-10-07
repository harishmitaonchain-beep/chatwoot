# Demo-video data for account 1 (local only). Run: bundle exec rails runner <this file>
# rubocop:disable all
require 'faker'
require_relative Rails.root.join('lib/seeders/reports/conversation_creator').to_s
require_relative Rails.root.join('lib/seeders/reports/message_creator').to_s
require_relative Rails.root.join('lib/seeders/reports/assistant_conversation_creator').to_s

DEMO_DIR = File.expand_path("../assets", __dir__)
ActiveJob::Base.queue_adapter = :test # no outbound sends / webhooks / LLM calls while seeding
Faker::Config.random = Random.new(42)
srand(42)

ACCOUNT = Account.find(1)
ADMIN = User.find_by!(email: 'john@acme.inc')

def section(name)
  print "#{name}... "
  yield
  puts 'ok'
rescue StandardError => e
  puts "FAILED: #{e.class}: #{e.message}"
  puts e.backtrace.first(3)
end

SCENARIOS = [
  { subject: 'Order #PL-48213 arrived damaged', labels: %w[delivery], team: 'warehouse',
    c: ['Hi, my order #PL-48213 arrived today and the box is crushed. Two reams of the A4 paper are torn.',
        'Yes, I still have the packaging. Do you need photos?',
        'Just sent them over. Can you ship replacements before Friday? We have a print run scheduled.',
        'Perfect, thank you for sorting this out so quickly!'],
    a: ['Sorry about that! Could you share a couple of photos of the box and the damaged reams?',
        'Thanks, that helps. I have raised a damage claim with the courier.',
        'Replacements are on the way with express shipping, they should reach you by Thursday. No charge, of course.',
        'Happy to help. I will keep this open until the delivery is confirmed.'] },
  { subject: 'Refund for duplicate charge', labels: %w[billing], team: 'administration',
    c: ['I was charged twice for invoice INV-2026-0917. Can you refund one of them?',
        'It shows two charges of $1,890 on 17 Sep on my company card.',
        'How long will the refund take to show up?',
        'Great, thanks for the quick help.'],
    a: ['Thanks for flagging this. Let me check the payment records for that invoice.',
        'I can see the duplicate. The second charge was a retry that should have been voided. I have issued a full refund for it.',
        'Refunds usually appear within 5 to 7 business days depending on your bank.',
        'You are welcome! I have also attached the updated invoice for your records.'] },
  { subject: 'Bulk pricing for 500 reams per month', labels: %w[lead premium-customer], team: 'sales',
    c: ['We are a print shop and need about 500 reams of A4 every month. Do you offer volume pricing?',
        'Mostly 80gsm, sometimes 100gsm for client work.',
        'Can we also get Net 30 payment terms?',
        'Sounds good. Please send the quote to procurement@northwind.test.'],
    a: ['Yes, we do! Volume pricing starts at 200 reams a month. Which paper weight do you usually order?',
        'For 500 reams of 80gsm we can offer $21.50 per ream, about 14% below list price.',
        'Net 30 is available for business accounts after a quick credit check. I can start that for you.',
        'Done, the quote is on its way. I have also booked a short call with our account manager for tomorrow.'] },
  { subject: 'Change delivery address', labels: %w[delivery], team: 'warehouse',
    c: ['Can I change the delivery address for order #PL-48377? We moved offices last week.',
        'New address: 118 Market Street, Floor 4, San Francisco CA 94105.',
        'Will this delay the delivery?',
        'Thanks!'],
    a: ['Sure, the order has not shipped yet so we can update it. What is the new address?',
        'Updated. The warehouse has the new address on the packing slip.',
        'No delay, it is still scheduled to ship tomorrow and arrive in 2 business days.',
        'Anytime! You will get a tracking link by email once it ships.'] },
  { subject: 'Discount code not working', labels: %w[billing software], team: 'sales',
    c: ['The code BACKTOSCHOOL20 says it is invalid at checkout.',
        'My cart has 3 packs of envelopes and one box of cardstock.',
        'Oh I see. Can you still apply it this time?',
        'Brilliant, thank you!'],
    a: ['Sorry about that. Could you tell me what is in your cart? Some codes only apply to certain categories.',
        'That code applies to orders over $150. Your cart is just under, at $142.',
        'Of course. I have applied a 20% discount manually to your draft order. Here is the payment link.',
        'Enjoy your order!'] },
  { subject: 'Cannot log in to my PaperLayer account', labels: %w[software], team: 'administration',
    c: ['I keep getting "invalid password" even after resetting it.',
        'I am using sarah@brightpath.test.',
        'Got the email this time. Logged in now.',
        'Thank you!'],
    a: ['Sorry for the trouble! Which email address are you logging in with?',
        'The account has two-factor login enabled, and an old device was still registered. I have cleared it. Please try resetting once more.',
        'Great to hear. I would recommend setting up two-factor login again from your profile.',
        'Anytime!'] },
  { subject: 'Upgrade to Business plan', labels: %w[lead billing], team: 'sales',
    c: ['We are on the Starter plan. What do we get if we move to Business?',
        'The team is 12 people now. Does Business cover all of them?',
        'OK, please upgrade us from next month.',
        'Perfect.'],
    a: ['Business adds shared ordering, approval workflows, monthly invoicing and a dedicated account manager.',
        'Yes, Business includes up to 25 users. You would save about $40 a month compared to adding seats on Starter.',
        'Done! The upgrade takes effect on 1 October and the new invoice will reflect the change.',
        'Welcome to Business! Let us know if you need help setting up approvals.'] },
  { subject: 'Wrong item delivered', labels: %w[delivery ops-handover], team: 'warehouse',
    c: ['I ordered glossy photo paper but received matte.',
        'Order number is #PL-48502.',
        'Do I need to send the matte one back?',
        'Great, thanks.'],
    a: ['Oh no, sorry about the mix-up! Can you share the order number?',
        'Found it. It was a picking error at the warehouse. I have dispatched the glossy paper today.',
        'No need, please keep the matte paper with our apologies.',
        'You are welcome! Tracking details are in your inbox.'] },
  { subject: 'Invoice copy needed for accounting', labels: %w[billing], team: 'administration',
    c: ['Can you send me copies of our invoices for August and September?',
        'Yes, please address them to Northwind Traders LLC.',
        'Received, thank you.',
        'Have a great day!'],
    a: ['Of course! Should the invoices be addressed to your company name?',
        'Here you go. I have attached both invoices as PDFs.',
        'Glad to help. You can also download invoices anytime from Billing > Invoices.',
        'You too!'] },
  { subject: 'API access for order automation', labels: %w[software premium-customer], team: 'management',
    c: ['We want to automate reorders from our inventory system. Do you have an API?',
        'Is there a webhook when an order ships?',
        'What are the rate limits?',
        'Thanks, that is everything we need.'],
    a: ['Yes, the REST API supports creating orders, checking stock and tracking shipments. You can generate a key under Settings > Integrations.',
        'Yes, you can subscribe to order.shipped and order.delivered events.',
        '600 requests per minute per key, which is plenty for inventory syncs.',
        'Great! Our docs have a quick-start for reorder automation. Ping us if you get stuck.'] },
  { subject: 'Cancel subscription', labels: %w[billing], team: 'sales',
    c: ['I want to cancel our monthly paper subscription.',
        'We are switching to a digital-first workflow, so we print much less.',
        'Actually a smaller quarterly delivery would work. Can we switch?',
        'Great, thanks for the flexibility.'],
    a: ['Sorry to hear that! May I ask why you would like to cancel?',
        'That makes sense. Instead of cancelling, would a quarterly delivery of 20 reams work? It is about 70% cheaper.',
        'Done. The next delivery is on 15 December, and billing is now quarterly.',
        'Anytime!'] },
  { subject: 'Delivery ETA for order #PL-48611', labels: %w[delivery], team: 'warehouse',
    c: ['When will order #PL-48611 arrive? The tracking page has not updated in two days.',
        'It needs to reach us before our event on Saturday.',
        'That works, thank you.',
        'Got it, the parcel just arrived!'],
    a: ['Let me check with the courier.',
        'The parcel is at the regional hub. The courier confirmed delivery on Thursday.',
        'I will keep an eye on it and update you if anything changes.',
        'Great to hear! Good luck with the event.'] },
  { subject: 'Sustainable paper options', labels: %w[lead], team: 'sales',
    c: ['Do you have 100% recycled paper? Our company has new sustainability targets.',
        'Is it FSC certified?',
        'Can we get samples before we place a big order?',
        'Thanks!'],
    a: ['Yes! Our EcoLayer range is 100% post-consumer recycled paper.',
        'It is FSC Recycled certified and carbon-neutral delivered.',
        'Absolutely. I will send a free sample pack to your office this week.',
        'You are welcome. The sample pack includes a discount code for your first order.'] },
  { subject: 'Delete my account data', labels: %w[software ops-handover], team: 'management',
    c: ['Please delete my account and all personal data you hold.',
        'Yes, I understand I will lose my order history.',
        'Thank you for handling this.',
        'Confirmed, thanks.'],
    a: ['We can do that. Please note this will remove your order history and saved addresses. Do you want to proceed?',
        'Your deletion request has been logged and will be completed within 30 days, as per our privacy policy.',
        'You will receive a confirmation email once the data has been removed.',
        'Take care!'] }
].freeze

class DemoMessageCreator < Seeders::Reports::MessageCreator
  def initialize(scenario:, count:, live:, **kw)
    super(**kw)
    @scn = scenario
    @count = count
    @live = live
    @ci = 0
    @ai = 0
  end

  def create_messages
    first_agent_reply = true
    @count.times do |i|
      message = create_single_message(i)
      first_agent_reply = handle_reply_tracking(message, i, first_agent_reply)
    end
  end

  private

  def calculate_message_delay(is_incoming)
    return rand((2.minutes)..(15.minutes)) if @live

    super
  end

  def create_incoming_message
    content = @scn[:c][@ci % @scn[:c].size]
    @ci += 1
    @conversation.messages.create!(account: @account, inbox: @conversation.inbox, message_type: :incoming,
                                   content: content, sender: @conversation.contact)
  end

  def create_outgoing_message
    content = @scn[:a][@ai % @scn[:a].size]
    @ai += 1
    @conversation.messages.create!(account: @account, inbox: @conversation.inbox, message_type: :outgoing,
                                   content: content, sender: @conversation.assignee || @agents.sample)
  end
end

class DemoConversationCreator < Seeders::Reports::ConversationCreator
  def find_or_create_contact_inbox(contact, inbox)
    source = case inbox.channel_type
             when 'Channel::Whatsapp' then "1#{rand(200_000_000..999_999_999)}#{rand(10..99)}"
             when 'Channel::Sms' then "+1#{rand(2_000_000_000..9_999_999_999)}"
             when 'Channel::Email' then contact.email.presence || "#{SecureRandom.hex(4)}@example.test"
             else SecureRandom.hex
             end
    inbox.contact_inboxes.find_by(contact: contact) || inbox.contact_inboxes.create!(contact: contact, source_id: source)
  end

  # resolve_after: nil keeps it open
  def create_demo(created_at:, scenario:, inbox:, contact:, assignee:, count:, live:, resolve_after:, priority: nil)
    conversation = nil
    travel_to(created_at) do
      contact_inbox = find_or_create_contact_inbox(contact, inbox)
      team = @teams.find { |t| t.name.include?(scenario[:team]) }
      conversation = contact_inbox.conversations.create!(
        account: @account, inbox: inbox, contact: contact, assignee: assignee, team: team, priority: priority,
        additional_attributes: inbox.email? ? { 'mail_subject' => scenario[:subject] } : {}
      )
      conversation.update_labels(scenario[:labels])
      DemoMessageCreator.new(account: @account, agents: @agents, conversation: conversation,
                             scenario: scenario, count: count, live: live).create_messages
    end
    travel_back

    if resolve_after
      resolved_at = created_at + resolve_after
      conversation.update_columns(status: Conversation.statuses[:resolved], updated_at: resolved_at)
      travel_to(resolved_at) { trigger_conversation_resolved_event(conversation) }
      travel_back
    end
    conversation
  end
end

agents = ACCOUNT.users.to_a
inboxes = ACCOUNT.inboxes.to_a
inbox = ->(type) { inboxes.find { |i| i.channel_type == type } }
web, email, wa, sms, api = %w[Channel::WebWidget Channel::Email Channel::Whatsapp Channel::Sms Channel::Api].map { |t| inbox.call(t) }
labels = ACCOUNT.labels.index_by(&:title)

section('Enterprise plan + feature flags') do
  InstallationConfig.find_or_initialize_by(name: 'INSTALLATION_PRICING_PLAN').update!(value: 'enterprise', locked: true)
  InstallationConfig.find_or_initialize_by(name: 'INSTALLATION_PRICING_PLAN_QUANTITY').update!(value: 100, locked: true)
  GlobalConfig.clear_cache
  ACCOUNT.enable_features!(*%w[sla custom_roles audit_logs captain_integration custom_tools message_reply_to csat_review_notes inbox_view])
end

section('Inbox members + CSAT') do
  inboxes.each { |i| agents.each { |u| InboxMember.find_or_create_by!(inbox: i, user: u) } }
  [web, email, wa].each { |i| i.update!(csat_survey_enabled: true) }
  Message.unscoped.where(account_id: ACCOUNT.id, status: :failed).update_all(status: Message.statuses[:delivered])
end

section('Custom attributes') do
  defs = [
    ['Plan', 'plan', :list, :contact_attribute, %w[Starter Business Enterprise]],
    ['Monthly spend', 'monthly_spend', :currency, :contact_attribute, []],
    ['Customer since', 'customer_since', :date, :contact_attribute, []],
    ['VIP', 'vip', :checkbox, :contact_attribute, []],
    ['Order ID', 'order_id', :text, :conversation_attribute, []],
    ['Issue type', 'issue_type', :list, :conversation_attribute, ['Delivery', 'Billing', 'Product', 'Account']],
    ['Refund amount', 'refund_amount', :currency, :conversation_attribute, []],
    ['Industry', 'industry', :list, :company_attribute, ['Retail', 'Education', 'Printing', 'Legal', 'Healthcare']]
  ]
  defs.each do |name, key, type, model, values|
    CustomAttributeDefinition.find_or_create_by!(account: ACCOUNT, attribute_key: key, attribute_model: model) do |d|
      d.attribute_display_name = name
      d.attribute_display_type = type
      d.attribute_values = values
    end
  end
end

section('Contacts + companies') do
  companies = [['Northwind Traders', 'northwind.test'], ['BrightPath Schools', 'brightpath.test'], ['Inkwell Print Co', 'inkwell.test'],
               ['Harbor Legal LLP', 'harborlegal.test'], ['Greenleaf Clinics', 'greenleaf.test'], ['Summit Retail', 'summitretail.test']]
  company_records = companies.map do |name, domain|
    Company.find_or_create_by!(account: ACCOUNT, domain: domain) do |c|
      c.name = name
      c.description = "#{name} buys office and print supplies from PaperLayer."
      c.custom_attributes = { 'industry' => %w[Retail Education Printing Legal Healthcare].sample }
    end
  end
  if ACCOUNT.contacts.count < 60
    50.times do
      co = company_records.sample
      first = Faker::Name.first_name
      last = Faker::Name.last_name
      ACCOUNT.contacts.create!(
        name: "#{first} #{last}", email: "#{first}.#{last}.#{rand(99)}@#{co.domain}".downcase,
        phone_number: "+1#{rand(2_000_000_000..9_999_999_999)}", company_id: co.id,
        additional_attributes: { 'company_name' => co.name, 'city' => Faker::Address.city, 'country' => 'United States',
                                 'country_code' => 'US', 'description' => Faker::Job.title },
        custom_attributes: { 'plan' => %w[Starter Business Enterprise].sample, 'monthly_spend' => rand(80..4000),
                             'customer_since' => Faker::Date.between(from: 3.years.ago, to: 2.months.ago).to_s,
                             'vip' => rand < 0.2 }
      )
    end
  end
  ACCOUNT.contacts.where(company_id: nil).find_each do |c|
    co = Company.where(account: ACCOUNT).sample
    c.update_columns(company_id: co.id)
  end
  ACCOUNT.contacts.limit(12).each do |c|
    next if c.notes.exists?
    Note.create!(account: ACCOUNT, contact: c, user: agents.sample, content: [
      'Prefers email over phone. Orders usually go out on Mondays.',
      'Interested in the EcoLayer recycled range. Follow up next quarter.',
      'Had a delivery issue in August, handled with a replacement. Be extra careful with this account.',
      'Decision maker for procurement. Budget renews in January.'
    ].sample)
  end
end

contacts = ACCOUNT.contacts.to_a
creator = DemoConversationCreator.new(account: ACCOUNT, resources: { contacts: contacts, inboxes: inboxes, teams: ACCOUNT.teams.to_a,
                                                                    labels: ACCOUNT.labels.to_a, agents: agents })
history_inboxes = [web, web, web, email, email, wa, wa, inbox.call('Channel::FacebookPage'), inbox.call('Channel::TwitterProfile'),
                   sms, inbox.call('Channel::Telegram'), inbox.call('Channel::Line')]

section('History: 280 conversations over 90 days (reports)') do
  if ACCOUNT.conversations.where('conversations.created_at < ?', 3.days.ago).count > 50
    puts '(already seeded, skipping)'
  else
    280.times do |i|
      created_at = Faker::Time.between(from: 90.days.ago, to: 2.days.ago)
      ib = history_inboxes.sample
      creator.create_demo(created_at: created_at, scenario: SCENARIOS.sample, inbox: ib, contact: contacts.sample,
                          assignee: ib.members.sample, count: rand(4..8), live: false,
                          resolve_after: rand < 0.93 ? rand((20.minutes)..(30.hours)) : nil,
                          priority: [nil, nil, 'low', 'medium', 'high', 'urgent'].sample)
      print "\r  #{i + 1}/280 " if (i % 20).zero?
    end
  end
end

section('Live queue: 22 conversations in the last few hours') do
  if ACCOUNT.conversations.where('conversations.created_at > ?', 12.hours.ago).count > 30
    puts '(already seeded, skipping)'
  else
    22.times do |i|
      ib = [web, web, web, email, wa, wa, sms, inbox.call('Channel::FacebookPage'), inbox.call('Channel::Telegram')].sample
      unassigned = i < 6
      c = creator.create_demo(created_at: rand((20.minutes)..(8.hours)).ago - 2.hours, scenario: SCENARIOS.sample, inbox: ib,
                              contact: contacts.sample, assignee: unassigned ? nil : ([ADMIN] * 3 + agents).sample,
                              count: unassigned ? 1 : [3, 5].sample, live: true, resolve_after: nil,
                              priority: i < 3 ? 'urgent' : [nil, 'high', 'medium', 'low'].sample)
      c.update_columns(status: Conversation.statuses[:pending]) if i.between?(18, 19)
      c.update_columns(status: Conversation.statuses[:snoozed], snoozed_until: 2.days.from_now) if i == 21
    end
  end
end

section('Private notes, mentions, notifications, attachments') do
  Mention.where(account: ACCOUNT).delete_all
  Notification.where(account: ACCOUNT, user: ADMIN).delete_all
  Message.where(account: ACCOUNT).where('content LIKE ? OR content IN (?)', '%approve a goodwill credit%',
                                        ['Here are the photos of the damaged box.', 'Attached is the corrected invoice for September.']).destroy_all
  open_convs = ACCOUNT.conversations.open.where.not(assignee_id: nil).order(last_activity_at: :desc).limit(8).to_a
  open_convs.first(4).each do |conv|
    note = conv.messages.create!(account: ACCOUNT, inbox: conv.inbox, message_type: :outgoing, private: true, sender: agents.sample,
                                 content: "@[#{ADMIN.name}](mention://user/#{ADMIN.id}/#{ADMIN.name}) can you approve a goodwill credit for this customer? They have been with us for 3 years.")
    Mention.find_or_create_by!(user: ADMIN, conversation: conv, account: ACCOUNT) { |m| m.mentioned_at = note.created_at }
    Notification.create!(account: ACCOUNT, user: ADMIN, notification_type: :conversation_mention, primary_actor: conv,
                         secondary_actor: note, last_activity_at: note.created_at)
  end
  ACCOUNT.conversations.open.where(assignee: ADMIN).limit(5).each do |conv|
    Notification.create!(account: ACCOUNT, user: ADMIN, notification_type: :conversation_assignment, primary_actor: conv,
                         last_activity_at: conv.last_activity_at)
  end
  damaged = ACCOUNT.conversations.open.joins(:messages).where(messages: { content: SCENARIOS[0][:c][0] }).first || open_convs.last
  msg = damaged.messages.create!(account: ACCOUNT, inbox: damaged.inbox, message_type: :incoming, sender: damaged.contact,
                                 content: 'Here are the photos of the damaged box.')
  msg.attachments.create!(account_id: ACCOUNT.id, file_type: :image,
                          file: { io: File.open(File.join(DEMO_DIR, 'damaged-box.png')), filename: 'IMG_4821.png', content_type: 'image/png' })
  billing = ACCOUNT.conversations.open.where(inbox: email).first || open_convs.first
  inv = billing.messages.create!(account: ACCOUNT, inbox: billing.inbox, message_type: :outgoing, sender: billing.assignee || ADMIN,
                                 content: 'Attached is the corrected invoice for September.')
  inv.attachments.create!(account_id: ACCOUNT.id, file_type: :file,
                          file: { io: File.open(File.join(DEMO_DIR, 'invoice.pdf')), filename: 'INV-2026-0917.pdf', content_type: 'application/pdf' })
  ACCOUNT.conversations.open.limit(10).each_with_index do |conv, i|
    conv.update!(custom_attributes: { 'order_id' => "PL-#{48_200 + i * 37}", 'issue_type' => %w[Delivery Billing Product Account].sample })
  end
end

section('CSAT responses') do
  feedback = { 5 => ['Super fast and friendly, thank you!', 'Problem solved in minutes.', 'Great service as always.', nil],
               4 => ['Good help, a bit slow at first.', 'Resolved, thanks.', nil],
               3 => ['Took a while to get an answer.', nil],
               2 => ['I had to explain the issue twice.'],
               1 => ['Still waiting on my refund.'] }
  ACCOUNT.conversations.resolved.where(inbox: [web, email, wa]).where.not(assignee_id: nil).find_each do |conv|
    next if rand > 0.6 || CsatSurveyResponse.exists?(conversation_id: conv.id)

    rating = [5, 5, 5, 5, 4, 4, 4, 3, 2, 1].sample
    at = conv.updated_at + rand(2..40).minutes
    msg = nil
    msg = conv.messages.create!(account: ACCOUNT, inbox: conv.inbox, message_type: :template, content_type: :input_csat,
                                content: 'Please rate the conversation', created_at: at, updated_at: at,
                                content_attributes: { 'submitted_values' => { 'csat_survey_response' => { 'rating' => rating, 'feedback_message' => feedback[rating].sample } } })
    CsatSurveyResponse.create!(account: ACCOUNT, conversation: conv, contact: conv.contact, message: msg, rating: rating,
                               feedback_message: feedback[rating].sample, assigned_agent_id: conv.assignee_id, created_at: at, updated_at: at)
    conv.update_columns(updated_at: at)
  end
end

section('Canned responses') do
  ACCOUNT.canned_responses.destroy_all
  {
    'thanks' => 'Thanks for reaching out to PaperLayer! Let me look into this for you.',
    'tracking' => 'You can track your order anytime at paperlayer.test/track using your order number.',
    'refund' => 'I have issued a full refund. It usually shows up within 5 to 7 business days.',
    'damaged' => 'Sorry your order arrived damaged! Could you share a photo of the box and the items?',
    'invoice' => 'You can download all invoices from Billing > Invoices in your PaperLayer account.',
    'bulk' => 'We offer volume pricing from 200 reams a month. Could you share your typical monthly volume?',
    'eco' => 'Our EcoLayer range is 100% post-consumer recycled paper and FSC Recycled certified.',
    'hours' => 'Our support team is available Monday to Friday, 9am to 6pm ET.',
    'closing' => 'Glad I could help! Is there anything else I can do for you today?',
    'followup' => 'Just checking in. Were you able to try the steps above?'
  }.each { |code, text| ACCOUNT.canned_responses.create!(short_code: code, content: text) }
end

section('Macros') do
  sales = ACCOUNT.teams.find { |t| t.name.include?('sales') }
  wh = ACCOUNT.teams.find { |t| t.name.include?('warehouse') }
  [
    ['Damaged delivery', [{ 'action_name' => 'add_label', 'action_params' => ['delivery'] },
                          { 'action_name' => 'assign_team', 'action_params' => [wh.id] },
                          { 'action_name' => 'send_message', 'action_params' => ['Sorry your order arrived damaged! We are sending replacements right away.'] }]],
    ['Hand over to sales', [{ 'action_name' => 'add_label', 'action_params' => ['lead'] },
                            { 'action_name' => 'assign_team', 'action_params' => [sales.id] },
                            { 'action_name' => 'add_private_note', 'action_params' => ['Qualified lead. Please follow up within 24h.'] }]],
    ['Refund issued + resolve', [{ 'action_name' => 'add_label', 'action_params' => ['billing'] },
                                 { 'action_name' => 'send_message', 'action_params' => ['Your refund has been issued and should appear in 5 to 7 business days.'] },
                                 { 'action_name' => 'resolve_conversation', 'action_params' => [] }]],
    ['Escalate as urgent', [{ 'action_name' => 'change_priority', 'action_params' => ['urgent'] },
                            { 'action_name' => 'add_label', 'action_params' => ['ops-handover'] }]]
  ].each_with_index do |(name, actions), i|
    Macro.find_or_create_by!(account: ACCOUNT, name: name) do |m|
      m.actions = actions
      m.visibility = i.zero? ? :personal : :global
      m.created_by = ADMIN
      m.updated_by = ADMIN
    end
  end
end

section('Automation rules') do
  sales = ACCOUNT.teams.find { |t| t.name.include?('sales') }
  wh = ACCOUNT.teams.find { |t| t.name.include?('warehouse') }
  [
    ['Route pricing questions to Sales', 'Leads asking about pricing go straight to the sales team.', 'message_created',
     [{ 'attribute_key' => 'content', 'filter_operator' => 'contains', 'values' => ['pricing'], 'query_operator' => 'OR' },
      { 'attribute_key' => 'content', 'filter_operator' => 'contains', 'values' => ['quote'], 'query_operator' => nil }],
     [{ 'action_name' => 'assign_team', 'action_params' => [sales.id] }, { 'action_name' => 'add_label', 'action_params' => ['lead'] }]],
    ['Delivery issues to Warehouse', 'Anything about damaged or late parcels goes to the warehouse team.', 'conversation_created',
     [{ 'attribute_key' => 'content', 'filter_operator' => 'contains', 'values' => ['damaged'], 'query_operator' => nil }],
     [{ 'action_name' => 'assign_team', 'action_params' => [wh.id] }, { 'action_name' => 'add_label', 'action_params' => ['delivery'] }]],
    ['Tag WhatsApp conversations', 'Label every new WhatsApp conversation.', 'conversation_created',
     [{ 'attribute_key' => 'inbox_id', 'filter_operator' => 'equal_to', 'values' => [wa.id], 'query_operator' => nil }],
     [{ 'action_name' => 'change_priority', 'action_params' => ['medium'] }]],
    ['Premium customers get high priority', 'Keep premium customers at the top of the queue.', 'conversation_updated',
     [{ 'attribute_key' => 'labels', 'filter_operator' => 'equal_to', 'values' => ['premium-customer'], 'query_operator' => nil }],
     [{ 'action_name' => 'change_priority', 'action_params' => ['high'] }]]
  ].each do |name, desc, event, conditions, actions|
    AutomationRule.find_or_create_by!(account: ACCOUNT, name: name) do |r|
      r.description = desc
      r.event_name = event
      r.conditions = conditions
      r.actions = actions
    end
  end
end

section('Saved folders + segments') do
  [['Urgent & open', :conversation, { 'payload' => [{ 'attribute_key' => 'priority', 'filter_operator' => 'equal_to', 'values' => ['urgent'], 'query_operator' => 'and' },
                                                    { 'attribute_key' => 'status', 'filter_operator' => 'equal_to', 'values' => ['open'], 'query_operator' => nil }] }],
   ['Billing queue', :conversation, { 'payload' => [{ 'attribute_key' => 'labels', 'filter_operator' => 'equal_to', 'values' => ['billing'], 'query_operator' => nil }] }],
   ['WhatsApp', :conversation, { 'payload' => [{ 'attribute_key' => 'inbox_id', 'filter_operator' => 'equal_to', 'values' => [wa.id], 'query_operator' => nil }] }],
   ['Enterprise customers', :contact, { 'payload' => [{ 'attribute_key' => 'plan', 'filter_operator' => 'equal_to', 'values' => ['Enterprise'], 'query_operator' => nil, 'custom_attribute_type' => '' }] }],
   ['VIP contacts', :contact, { 'payload' => [{ 'attribute_key' => 'vip', 'filter_operator' => 'equal_to', 'values' => [true], 'query_operator' => nil, 'custom_attribute_type' => '' }] }]
  ].each do |name, type, query|
    CustomFilter.find_or_create_by!(account: ACCOUNT, user: ADMIN, name: name, filter_type: type) { |f| f.query = query }
  end
end

section('SLA policies') do
  p1 = SlaPolicy.find_or_create_by!(account: ACCOUNT, name: 'Premium support') do |s|
    s.description = 'For premium customers: reply in 15 minutes, resolve within 4 hours.'
    s.first_response_time_threshold = 15.minutes.to_i
    s.next_response_time_threshold = 30.minutes.to_i
    s.resolution_time_threshold = 4.hours.to_i
  end
  p2 = SlaPolicy.find_or_create_by!(account: ACCOUNT, name: 'Standard') do |s|
    s.description = 'Default: reply in 2 hours, resolve within 24 hours, business hours only.'
    s.first_response_time_threshold = 2.hours.to_i
    s.next_response_time_threshold = 4.hours.to_i
    s.resolution_time_threshold = 24.hours.to_i
    s.only_during_business_hours = true
  end
  ACCOUNT.conversations.order(created_at: :desc).limit(160).each_with_index do |conv, i|
    next if AppliedSla.exists?(conversation_id: conv.id)

    policy = i.even? ? p1 : p2
    status = if conv.resolved? then rand < 0.8 ? :hit : :missed
             else rand < 0.7 ? :active : :active_with_misses
             end
    AppliedSla.create!(account: ACCOUNT, conversation: conv, sla_policy: policy, sla_status: status,
                       created_at: conv.created_at, updated_at: conv.updated_at)
    conv.update_columns(sla_policy_id: policy.id) if conv.has_attribute?(:sla_policy_id)
  end
end

section('Campaigns') do
  lead = labels['lead']
  premium = labels['premium-customer']
  Campaign.find_or_create_by!(account: ACCOUNT, title: 'Pricing page helper') do |c|
    c.inbox = web
    c.sender = ADMIN
    c.message = 'Comparing plans? I can help you pick the right one for your team.'
    c.trigger_rules = { 'url' => 'https://paperlayer.test/pricing', 'time_on_page' => 10 }
  end
  Campaign.find_or_create_by!(account: ACCOUNT, title: 'EcoLayer launch') do |c|
    c.inbox = web
    c.message = 'New: our 100% recycled EcoLayer range is here. Want a free sample pack?'
    c.trigger_rules = { 'url' => 'https://paperlayer.test/products/*', 'time_on_page' => 20 }
  end
  Campaign.find_or_create_by!(account: ACCOUNT, title: 'Back-to-school restock') do |c|
    c.inbox = sms
    c.message = 'PaperLayer: Back-to-school restock is live. Use BACKTOSCHOOL20 for 20% off orders over $150.'
    c.audience = [{ 'type' => 'Label', 'id' => lead.id }]
    c.scheduled_at = 3.days.from_now
  end
  done = Campaign.find_or_create_by!(account: ACCOUNT, title: 'Q3 loyalty thank-you') do |c|
    c.inbox = sms
    c.message = 'Thanks for being a PaperLayer customer! Here is 15% off your next order: THANKYOU15'
    c.audience = [{ 'type' => 'Label', 'id' => premium.id }]
    c.scheduled_at = 5.days.from_now
  end
  done.update_columns(campaign_status: Campaign.campaign_statuses[:completed], scheduled_at: 20.days.ago)
end

section('Help Center') do
  portal = Portal.find_or_create_by!(slug: 'paperlayer') do |p|
    p.account = ACCOUNT
    p.name = 'PaperLayer Help Center'
    p.color = '#1f93ff'
    p.page_title = 'PaperLayer Help Center'
    p.header_text = 'How can we help?'
    p.homepage_link = 'https://paperlayer.test'
    p.channel_web_widget_id = web.channel_id
    p.config = { 'allowed_locales' => %w[en es], 'default_locale' => 'en' }
  end
  cats = {
    'Getting started' => ['getting-started', '🚀', 'Set up your account and place your first order.'],
    'Orders & delivery' => ['orders-delivery', '📦', 'Tracking, delivery times and changing orders.'],
    'Billing & invoices' => ['billing-invoices', '💳', 'Payments, refunds, invoices and plans.'],
    'Account & security' => ['account-security', '🔐', 'Logins, two-factor and data privacy.']
  }.to_h do |name, (slug, icon, desc)|
    [name, Category.find_or_create_by!(portal: portal, slug: slug, locale: 'en') do |c|
      c.account = ACCOUNT
      c.name = name
      c.icon = icon
      c.description = desc
    end]
  end
  Category.find_or_create_by!(portal: portal, slug: 'primeros-pasos', locale: 'es') do |c|
    c.account = ACCOUNT
    c.name = 'Primeros pasos'
    c.icon = '🚀'
  end
  articles = [
    ['Getting started', 'Create your PaperLayer account', "Sign up at paperlayer.test with your work email.\n\n## Invite your team\nGo to **Settings > Team** and invite colleagues. Business plans include up to 25 users.\n\n## Add a delivery address\nYou can save multiple office addresses under **Settings > Addresses**."],
    ['Getting started', 'Place your first order', "1. Browse the catalogue or search for a product.\n2. Add items to your cart.\n3. Choose a delivery address and checkout.\n\nOrders placed before 2pm ET ship the same day."],
    ['Getting started', 'Set up approval workflows', "On the Business plan, orders above a set limit can require approval.\n\nGo to **Settings > Approvals** and choose who approves and the threshold amount."],
    ['Orders & delivery', 'Track your order', "Every order gets a tracking link by email once it ships. You can also track orders from **Orders** in your account."],
    ['Orders & delivery', 'Delivery times and shipping costs', "| Method | Time | Cost |\n|---|---|---|\n| Standard | 3-5 business days | Free over $100 |\n| Express | 1-2 business days | $12 |\n| Same day (select cities) | Today | $25 |"],
    ['Orders & delivery', 'My order arrived damaged', "Sorry about that! Take a photo of the box and the items, then reply to your order email or chat with us. We ship replacements at no cost, usually the same day."],
    ['Orders & delivery', 'Change or cancel an order', "Orders can be changed or cancelled until they ship. Open the order and choose **Edit** or **Cancel**."],
    ['Billing & invoices', 'Download invoices', "All invoices are under **Billing > Invoices**. You can download them as PDFs or have them emailed to your accounts team automatically."],
    ['Billing & invoices', 'Refund policy', "Unopened items can be returned within 30 days for a full refund. Refunds show up within 5 to 7 business days."],
    ['Billing & invoices', 'Payment terms for business accounts', "Business accounts can apply for Net 30 terms after a quick credit check. Contact sales to get started."],
    ['Account & security', 'Reset your password', "Click **Forgot password** on the login page. The reset link is valid for 1 hour."],
    ['Account & security', 'Turn on two-factor login', "Go to **Profile > Security** and scan the QR code with an authenticator app."],
    ['Account & security', 'Delete your account and data', "Contact support to request deletion. We complete requests within 30 days, as per our privacy policy."]
  ]
  articles.each_with_index do |(cat, title, content), i|
    Article.find_or_create_by!(portal: portal, slug: title.parameterize) do |a|
      a.account = ACCOUNT
      a.category = cats[cat]
      a.title = title
      a.description = content.lines.first.strip.delete('#*|').truncate(140)
      a.content = content
      a.author = [ADMIN, *agents.first(3)].sample
      a.status = i == 12 ? :draft : :published
      a.views = rand(40..2400)
      a.locale = 'en'
    end
  end
  Article.find_or_create_by!(portal: portal, slug: 'bulk-order-discounts') do |a|
    a.account = ACCOUNT
    a.category = cats['Billing & invoices']
    a.title = 'Bulk order discounts'
    a.content = 'Draft: volume pricing tiers for 2027.'
    a.author = ADMIN
    a.status = :draft
    a.locale = 'en'
  end
end

section('Agent bot, webhook, dashboard app, assignment policies') do
  AgentBot.find_or_create_by!(account: ACCOUNT, name: 'Order Status Bot') do |b|
    b.description = 'Answers "where is my order" questions from our order system.'
    b.outgoing_url = 'https://bots.paperlayer.test/order-status'
  end
  Webhook.find_or_create_by!(account: ACCOUNT, url: 'https://hooks.paperlayer.test/chatwoot') do |w|
    w.name = 'CRM sync'
    w.subscriptions = %w[conversation_created conversation_status_changed contact_created message_created]
  end
  DashboardApp.find_or_create_by!(account: ACCOUNT, title: 'Order lookup') do |d|
    d.user = ADMIN
    d.content = [{ 'type' => 'frame', 'url' => 'https://example.com/' }]
  end
  rr = AssignmentPolicy.find_or_create_by!(account: ACCOUNT, name: 'Round robin - website') do |p|
    p.description = 'Distribute new website chats evenly among online agents.'
  end
  AssignmentPolicy.find_or_create_by!(account: ACCOUNT, name: 'Longest waiting first') do |p|
    p.description = 'Assign the conversation that has waited longest first.'
    p.conversation_priority = :longest_waiting
  end
  InboxAssignmentPolicy.find_or_create_by!(inbox: web) { |x| x.assignment_policy = rr }
end

section('Captain assistant (records only, no AI key)') do
  assistant = Captain::Assistant.find_or_create_by!(account: ACCOUNT, name: 'PaperLayer Assistant') do |a|
    a.description = 'Answers order, delivery and billing questions for PaperLayer customers.'
    a.config = { 'feature_faq' => true, 'feature_memory' => true, 'product_name' => 'PaperLayer',
                 'welcome_message' => 'Hi! I am the PaperLayer assistant. Ask me about orders, delivery or billing.',
                 'handoff_message' => 'Let me connect you with someone from our team.',
                 'resolution_message' => 'Glad I could help! Closing this conversation.' }
  end
  CaptainInbox.find_or_create_by!(captain_assistant: assistant, inbox: api)
  faqs = [
    ['How long does standard delivery take?', 'Standard delivery takes 3 to 5 business days and is free on orders over $100.'],
    ['Do you offer express shipping?', 'Yes. Express delivery takes 1 to 2 business days and costs $12.'],
    ['How do I track my order?', 'You will get a tracking link by email when your order ships. You can also see it under Orders in your account.'],
    ['What is your refund policy?', 'Unopened items can be returned within 30 days for a full refund, which appears within 5 to 7 business days.'],
    ['My order arrived damaged, what should I do?', 'Send us a photo of the box and items. We ship replacements at no cost, usually the same day.'],
    ['Where can I download invoices?', 'Invoices are under Billing > Invoices in your PaperLayer account.'],
    ['Do you offer volume pricing?', 'Yes, volume pricing starts at 200 reams a month. Our sales team can send a quote.'],
    ['Is your recycled paper FSC certified?', 'Yes, the EcoLayer range is 100% post-consumer recycled and FSC Recycled certified.'],
    ['Can I change my delivery address?', 'Yes, as long as the order has not shipped. Open the order and choose Edit.'],
    ['What payment methods do you accept?', 'We accept cards, ACH bank transfer, and Net 30 invoicing for approved business accounts.'],
    ['How do I reset my password?', 'Click Forgot password on the login page. The link is valid for 1 hour.'],
    ['Can I cancel my subscription?', 'Yes, anytime from Billing > Subscription. You can also switch to quarterly deliveries.']
  ]
  faqs.each do |q, a|
    Captain::AssistantResponse.find_or_create_by!(account: ACCOUNT, assistant: assistant, question: q) { |r| r.answer = a; r.status = :approved }
  end
  [['Do you ship to Canada?', 'Yes, we ship to Canada. Delivery takes 5 to 8 business days.'],
   ['Can I get a sample pack?', 'Yes, sample packs are free for business accounts.'],
   ['Do you sell printer ink?', 'Not at the moment. We focus on paper, envelopes and cardstock.']].each do |q, a|
    Captain::FaqSuggestion.find_or_create_by!(account: ACCOUNT, assistant: assistant, question: q) { |r| r.answer = a; r.source_count = rand(2..9); r.status = :open }
  end
  [['Shipping policy', 'https://paperlayer.test/shipping'], ['Refund policy', 'https://paperlayer.test/refunds'],
   ['EcoLayer product guide', 'https://paperlayer.test/ecolayer'], ['Business plan overview', 'https://paperlayer.test/business']].each do |name, link|
    Captain::Document.find_or_create_by!(account: ACCOUNT, assistant: assistant, external_link: link) do |d|
      d.name = name
      d.content = "#{name}. #{faqs.map(&:last).sample(3).join(' ')}"
      d.status = :available
      d.sync_status = :synced if d.respond_to?(:sync_status=)
    end
  end
  [['Damaged delivery', 'Customer reports a damaged or wrong order.', 'Ask for the order number and a photo, apologise, then hand off to a human so they can ship a replacement.'],
   ['Refund request', 'Customer asks for a refund or reports a double charge.', 'Explain the refund policy. If there is a double charge, collect the invoice number and hand off to billing.'],
   ['Bulk order lead', 'Customer asks about volume pricing or quotes.', 'Ask for monthly volume and paper weight, then hand off to the sales team.']].each do |title, desc, instruction|
    Captain::Scenario.find_or_create_by!(account: ACCOUNT, assistant: assistant, title: title) { |s| s.description = desc; s.instruction = instruction }
  end
  Captain::CustomTool.find_or_create_by!(account: ACCOUNT, assistant: assistant, slug: 'order_status') do |t|
    t.title = 'Order status lookup'
    t.description = 'Looks up the shipping status of a PaperLayer order by order number.'
    t.http_method = 'GET'
    t.endpoint_url = 'https://api.paperlayer.test/orders/{{ order_id }}'
    t.param_schema = [{ 'name' => 'order_id', 'type' => 'string', 'description' => 'The order number, e.g. PL-48213', 'required' => true }]
  end

  if ACCOUNT.conversations.where(inbox: api).count < 50
    ac = Seeders::Reports::AssistantConversationCreator.new(account: ACCOUNT, assistant: assistant, inbox: api,
                                                            resources: { contacts: contacts, agents: agents })
    # swap the Lorem text for real Q&A
    ac.define_singleton_method(:incoming_message) do |conv|
      @faq_i = rand(faqs.size)
      m = conv.messages.create!(account: ACCOUNT, inbox: api, message_type: :incoming, content: faqs[@faq_i][0], sender: conv.contact)
      outcome_tracker(conv).record_eligibility(at: m.created_at)
      m
    end
    ac.define_singleton_method(:assistant_reply) do |conv, waiting_since:|
      m = conv.messages.create!(account: ACCOUNT, inbox: api, message_type: :outgoing, private: false, content: faqs[@faq_i || 0][1], sender: assistant)
      trigger_reply_time(m, waiting_since)
      m
    end
    ac.define_singleton_method(:human_reply) do |conv|
      agent = api.members.sample
      conv.update_column(:assignee_id, agent.id) if conv.assignee_id.nil?
      m = conv.messages.create!(account: ACCOUNT, inbox: api, message_type: :outgoing, private: false, sender: agent,
                                content: 'Hi, this is ' + agent.name.split.first + ' from PaperLayer. I have picked this up and will sort it out for you now.')
      outcome_tracker(conv).record_human_reply(message: m)
    end
    outcomes = ([:resolved_by_assistant] * 80 + [:handled_by_both] * 45 + [:handed_off] * 40 + [:resolved_and_reopened] * 25).shuffle
    outcomes.each { |o| ac.create_conversation(created_at: Faker::Time.between(from: 30.days.ago, to: 2.days.ago), outcome: o) }
  end
end

a = ACCOUNT.reload
puts "\nDone. conversations=#{a.conversations.count} (#{a.conversations.reorder(nil).group(:status).count}) contacts=#{a.contacts.count} " \
     "reporting_events=#{a.reporting_events.count} csat=#{CsatSurveyResponse.where(account: a).count} articles=#{Article.where(account: a).count}"
