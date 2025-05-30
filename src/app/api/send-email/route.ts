import { NextRequest, NextResponse } from 'next/server';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { headers } from 'next/headers';

// Initialize SES with explicit region and credentials
const ses = new SESClient({
  region: process.env.REGION,
  credentials: {
    accessKeyId: process.env.ACCESS_KEY_ID ?? '',
    secretAccessKey: process.env.SECRET_ACCESS_KEY ?? '',
  },
});

// Add OPTIONS handler for CORS preflight
export async function OPTIONS(request: NextRequest): Promise<NextResponse> {
  return NextResponse.json(
    {},
    {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    }
  );
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  console.log('[Email API] Request received');
  // Check request method
  if (request.method !== 'POST') {
    return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
  }

  // Get request headers
  const headersList = await headers();
  const contentType = headersList.get('content-type');

  // Validate content type
  if (!contentType?.includes('application/json')) {
    return NextResponse.json({ error: 'Content type must be application/json' }, { status: 415 });
  }

  try {
    // Log environment check with more detail
    console.log('[Email API] AWS Config:', {
      region: process.env.REGION,
      accessKeyIdLength: process.env.ACCESS_KEY_ID?.length,
      secretKeyLength: process.env.SECRET_ACCESS_KEY?.length,
      // Log first few chars of keys to verify correct values (be careful in prod)
      accessKeyPrefix: process.env.ACCESS_KEY_ID?.slice(0, 4),
      secretKeyPrefix: process.env.SECRET_ACCESS_KEY?.slice(0, 4),
    });

    const body = await request.json();
    const { name, email, message } = body;

    // Validate inputs
    if (!name || !email || !message) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: 'Invalid email format' }, { status: 400 });
    }

    const params = {
      Source: 'volpestyle@gmail.com', // Use your verified Gmail for now
      Destination: {
        ToAddresses: ['volpestyle@gmail.com'], // Same email
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
    const command = new SendEmailCommand(params);
    const response = await ses.send(command);
    console.log('[Email API] Email sent successfully:', response.MessageId);

    return NextResponse.json({
      success: true,
      messageId: response.MessageId,
    });
  } catch (error: unknown) {
    const err = error as { message?: string; code?: string };
    console.error('[Email API] Error:', {
      message: err.message,
      code: err.code,
      stack: (error as Error).stack,
    });

    return NextResponse.json(
      {
        error: 'Failed to send email',
        details: err.message || 'Unknown error',
        code: err.code,
      },
      { status: 500 }
    );
  } finally {
    // Add CORS headers to response
    const response = NextResponse.next();
    response.headers.set('Access-Control-Allow-Origin', '*');
    response.headers.set('Access-Control-Allow-Methods', 'POST');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type');
  }
}

// Add route segment config
export const runtime = 'edge'; // 'nodejs' (default) | 'edge'
export const dynamic = 'force-dynamic';
