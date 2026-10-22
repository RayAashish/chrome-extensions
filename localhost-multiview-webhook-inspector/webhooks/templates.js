/**
 * Built-in Webhook Payload Templates
 * Provides realistic sample payloads and default headers for common webhook providers.
 * All data is strictly local sample data.
 */

export const WEBHOOK_TEMPLATES = [
  // Stripe Checkout Session Completed
  {
    id: 'stripe-checkout-completed',
    provider: 'Stripe',
    name: 'Stripe: checkout.session.completed',
    description: 'Triggered when a customer successfully completes checkout',
    method: 'POST',
    defaultPath: '/api/webhooks/stripe',
    signatureScheme: 'stripe',
    defaultHeaders: {
      'Content-Type': 'application/json',
      'User-Agent': 'Stripe/1.0 (+https://stripe.com/docs/webhooks)'
    },
    body: JSON.stringify(
      {
        id: 'evt_{{uuid}}',
        object: 'event',
        api_version: '2023-10-16',
        created: '{{timestamp}}',
        data: {
          object: {
            id: 'cs_test_{{random_int}}',
            object: 'checkout.session',
            amount_subtotal: 4900,
            amount_total: 4900,
            currency: 'usd',
            customer: 'cus_{{random_int}}',
            customer_details: {
              email: '{{random_email}}',
              name: 'Jane Doe'
            },
            payment_status: 'paid',
            status: 'complete'
          }
        },
        livemode: false,
        pending_webhooks: 1,
        request: {
          id: 'req_{{random_int}}',
          idempotency_key: null
        },
        type: 'checkout.session.completed'
      },
      null,
      2
    )
  },

  // Stripe Payment Intent Succeeded
  {
    id: 'stripe-payment-intent-succeeded',
    provider: 'Stripe',
    name: 'Stripe: payment_intent.succeeded',
    description: 'Triggered when a payment intent completes successfully',
    method: 'POST',
    defaultPath: '/api/webhooks/stripe',
    signatureScheme: 'stripe',
    defaultHeaders: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(
      {
        id: 'evt_{{uuid}}',
        object: 'event',
        api_version: '2023-10-16',
        created: '{{timestamp}}',
        data: {
          object: {
            id: 'pi_{{random_int}}',
            object: 'payment_intent',
            amount: 8900,
            amount_received: 8900,
            currency: 'usd',
            status: 'succeeded'
          }
        },
        type: 'payment_intent.succeeded'
      },
      null,
      2
    )
  },

  // Stripe Invoice Paid
  {
    id: 'stripe-invoice-paid',
    provider: 'Stripe',
    name: 'Stripe: invoice.paid',
    description: 'Triggered when a recurring subscription invoice is paid',
    method: 'POST',
    defaultPath: '/api/webhooks/stripe',
    signatureScheme: 'stripe',
    defaultHeaders: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(
      {
        id: 'evt_{{uuid}}',
        object: 'event',
        created: '{{timestamp}}',
        data: {
          object: {
            id: 'in_{{random_int}}',
            object: 'invoice',
            amount_paid: 2900,
            currency: 'usd',
            paid: true,
            status: 'paid',
            subscription: 'sub_{{random_int}}'
          }
        },
        type: 'invoice.paid'
      },
      null,
      2
    )
  },

  // GitHub Push
  {
    id: 'github-push',
    provider: 'GitHub',
    name: 'GitHub: push',
    description: 'Triggered when code is pushed to a Git repository branch',
    method: 'POST',
    defaultPath: '/api/webhooks/github',
    signatureScheme: 'github',
    defaultHeaders: {
      'Content-Type': 'application/json',
      'X-GitHub-Event': 'push',
      'X-GitHub-Delivery': '{{uuid}}',
      'User-Agent': 'GitHub-Hookshot/71b2d72'
    },
    body: JSON.stringify(
      {
        ref: 'refs/heads/main',
        before: '6113728f27ae82c7b1a12f6593c6ffda040dbe14',
        after: '2c53f350c4e0f31cdbe9471542f5354d0f13d216',
        repository: {
          id: 1296269,
          name: 'localhost-app',
          full_name: 'dev-team/localhost-app',
          private: false
        },
        pusher: {
          name: 'octocat',
          email: '{{random_email}}'
        },
        sender: {
          login: 'octocat',
          id: 1
        },
        commits: [
          {
            id: '2c53f350c4e0f31cdbe9471542f5354d0f13d216',
            message: 'feat: add responsive layout and webhook inspection',
            timestamp: '{{iso_timestamp}}',
            author: {
              name: 'Developer',
              email: '{{random_email}}'
            }
          }
        ]
      },
      null,
      2
    )
  },

  // GitHub Pull Request
  {
    id: 'github-pull-request',
    provider: 'GitHub',
    name: 'GitHub: pull_request.opened',
    description: 'Triggered when a new pull request is opened',
    method: 'POST',
    defaultPath: '/api/webhooks/github',
    signatureScheme: 'github',
    defaultHeaders: {
      'Content-Type': 'application/json',
      'X-GitHub-Event': 'pull_request',
      'X-GitHub-Delivery': '{{uuid}}'
    },
    body: JSON.stringify(
      {
        action: 'opened',
        number: 42,
        pull_request: {
          id: 142000000,
          title: 'Implement Multi-View layout mirroring',
          user: {
            login: 'dev-user'
          },
          body: 'Synchronizes scroll, click, and form inputs across 3 viewports.',
          state: 'open'
        },
        repository: {
          name: 'my-frontend'
        }
      },
      null,
      2
    )
  },

  // Slack App Mention
  {
    id: 'slack-app-mention',
    provider: 'Slack',
    name: 'Slack: app_mention',
    description: 'Triggered when a bot is mentioned in a Slack channel',
    method: 'POST',
    defaultPath: '/api/webhooks/slack',
    signatureScheme: 'generic',
    defaultHeaders: {
      'Content-Type': 'application/json',
      'X-Slack-Request-Timestamp': '{{timestamp}}'
    },
    body: JSON.stringify(
      {
        token: 'verification_token_sample',
        team_id: 'T012AB3CDE',
        api_app_id: 'A012BC3DEF',
        event: {
          type: 'app_mention',
          user: 'U012AB3CDE',
          text: '<@U012BOTUSER> run responsive smoke tests on localhost',
          ts: '{{timestamp}}.000200',
          channel: 'C012AB3CDE',
          event_ts: '{{timestamp}}.000200'
        },
        type: 'event_callback',
        event_id: 'Ev{{uuid}}',
        event_time: '{{timestamp}}'
      },
      null,
      2
    )
  },

  // Twilio Inbound SMS
  {
    id: 'twilio-sms',
    provider: 'Twilio',
    name: 'Twilio: Inbound SMS (form-urlencoded)',
    description: 'Simulates incoming SMS notification to local webhook handler',
    method: 'POST',
    defaultPath: '/api/webhooks/twilio',
    signatureScheme: 'none',
    defaultHeaders: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'TwilioProxy/1.1'
    },
    body: 'MessageSid=SM{{uuid}}&AccountSid=AC{{random_int}}&From=%2B15551234567&To=%2B15559876543&Body=Hello+from+local+webhook+test&NumMedia=0'
  },

  // Shopify Order Created
  {
    id: 'shopify-order-created',
    provider: 'Shopify',
    name: 'Shopify: orders/create',
    description: 'Triggered when a new order is placed in Shopify store',
    method: 'POST',
    defaultPath: '/api/webhooks/shopify',
    signatureScheme: 'shopify',
    defaultHeaders: {
      'Content-Type': 'application/json',
      'X-Shopify-Topic': 'orders/create',
      'X-Shopify-Hmac-Sha256': '',
      'X-Shopify-Shop-Domain': 'local-store.myshopify.com'
    },
    body: JSON.stringify(
      {
        id: 820982911946154500,
        email: '{{random_email}}',
        created_at: '{{iso_timestamp}}',
        currency: 'USD',
        total_price: '124.99',
        subtotal_price: '119.99',
        total_tax: '5.00',
        line_items: [
          {
            id: 866550311764,
            title: 'Responsive Design Toolkit',
            price: '119.99',
            quantity: 1
          }
        ]
      },
      null,
      2
    )
  },

  // Razorpay Payment Captured
  {
    id: 'razorpay-payment-captured',
    provider: 'Razorpay',
    name: 'Razorpay: payment.captured',
    description: 'Triggered when a Razorpay payment is authorized and captured',
    method: 'POST',
    defaultPath: '/api/webhooks/razorpay',
    signatureScheme: 'generic',
    defaultHeaders: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(
      {
        entity: 'event',
        account_id: 'acc_{{random_int}}',
        event: 'payment.captured',
        contains: ['payment'],
        payload: {
          payment: {
            entity: {
              id: 'pay_{{random_int}}',
              amount: 250000,
              currency: 'INR',
              status: 'captured',
              order_id: 'order_{{random_int}}',
              email: '{{random_email}}',
              contact: '+919999999999'
            }
          }
        },
        created_at: '{{timestamp}}'
      },
      null,
      2
    )
  },

  // Generic JSON Webhook
  {
    id: 'generic-json',
    provider: 'Generic',
    name: 'Generic: Custom JSON Payload',
    description: 'Clean baseline JSON payload for general local API testing',
    method: 'POST',
    defaultPath: '/api/webhooks',
    signatureScheme: 'none',
    defaultHeaders: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(
      {
        event: 'user.signup',
        id: '{{uuid}}',
        timestamp: '{{timestamp}}',
        user: {
          id: 'usr_{{random_int}}',
          email: '{{random_email}}',
          name: 'Local Developer'
        }
      },
      null,
      2
    )
  }
];

export function getTemplateById(id) {
  return WEBHOOK_TEMPLATES.find(t => t.id === id) || WEBHOOK_TEMPLATES[0];
}
