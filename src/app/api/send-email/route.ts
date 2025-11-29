import { NextRequest, NextResponse } from 'next/server';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { headerIncludesTestMode } from '@/lib/test-flags';
let cachedSes: SESClient | undefined;

async function getSesClient(): Promise<SESClient> {
  if (!cachedSes) {
    const region = process.env.AWS_REGION ?? process.env.REGION ?? 'us-east-1';

    cachedSes = new SESClient({
      region,
    });
  }

  return cachedSes;
}

function withCors(response: NextResponse) {
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type');
  return response;
}

// Add OPTIONS handler for CORS preflight
export async function OPTIONS(): Promise<NextResponse> {
  return withCors(
    NextResponse.json({
      success: true,
    })
  );
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  console.log('[Email API] Request received');

  const headersList = request.headers;
  const contentType = headersList.get('content-type');
  const isIntegrationRequest = headerIncludesTestMode(headersList, 'integration');

  if (isIntegrationRequest) {
    return withCors(
      NextResponse.json({
        success: true,
        message: 'Integration test mode: email send skipped.',
      })
    );
  }

  if (!contentType?.includes('application/json')) {
    return withCors(NextResponse.json({ error: 'Content type must be application/json' }, { status: 415 }));
  }

  try {
    const body = await request.json();
    const { name, email, message } = body;

    if (!name || !email || !message) {
      return withCors(NextResponse.json({ error: 'Missing required fields' }, { status: 400 }));
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return withCors(NextResponse.json({ error: 'Invalid email format' }, { status: 400 }));
    }

    const params = {
      Source: 'volpestyle@gmail.com',
      Destination: {
        ToAddresses: ['volpestyle@gmail.com'],
      },
      Message: {
        Subject: {
          Data: `Portfolio Contact Form: ${name}`,
          Charset: 'UTF-8',
        },
        Body: {
          Html: {
            Data: `
              <h2>New Contact Form Submission</h2>
              <p><strong>Name:</strong> ${name}</p>
              <p><strong>Email:</strong> <a href="mailto:${email}">${email}</a></p>
              <p><strong>Message:</strong></p>
              <p>${message.replace(/\n/g, '<br>')}</p>
            `,
            Charset: 'UTF-8',
          },
          Text: {
            Data: [`Name: ${name}`, `Email: ${email}`, `Message: ${message}`].join('\n'),
            Charset: 'UTF-8',
          },
        },
      },
    };

    console.log('[Email API] Sending email to:', params.Destination.ToAddresses);
    const ses = await getSesClient();
    const command = new SendEmailCommand(params);
    const response = await ses.send(command);
    console.log('[Email API] Email sent successfully:', response.MessageId);

    return withCors(
      NextResponse.json({
        success: true,
        messageId: response.MessageId,
      })
    );
  } catch (error: unknown) {
    const err = error as { message?: string; code?: string };
    console.error('[Email API] Error:', {
      message: err.message,
      code: err.code,
      stack: (error as Error).stack,
    });

    return withCors(
      NextResponse.json(
        {
          error: 'Failed to send email',
          details: err.message || 'Unknown error',
          code: err.code,
        },
        { status: 500 }
      )
    );
  }
}

// Add route segment config
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
