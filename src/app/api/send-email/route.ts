import { NextResponse } from 'next/server';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

const ses = new SESClient({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

export async function POST(request: Request) {
  try {
    // Log environment check (don't log actual values)
    console.log('AWS Credentials Check:', {
      regionExists: !!process.env.AWS_REGION,
      accessKeyExists: !!process.env.AWS_ACCESS_KEY_ID,
      secretKeyExists: !!process.env.AWS_SECRET_ACCESS_KEY,
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

    const command = new SendEmailCommand(params);
    const response = await ses.send(command);

    return NextResponse.json({
      success: true,
      messageId: response.MessageId,
    });
  } catch (error: unknown) {
    const err = error as { message?: string; code?: string };
    console.error('Email sending error:', {
      message: err.message,
      code: err.code,
      error: err
    });

    return NextResponse.json(
      {
        error: 'Failed to send email',
        details: err.message || 'Unknown error',
        code: err.code
      },
      { status: 500 }
    );
  }
}
