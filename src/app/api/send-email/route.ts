import { NextResponse } from 'next/server';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

export async function POST(request: Request) {
  try {
    const { name, email, message } = await request.json();

    // Validate inputs
    if (!name || !email || !message) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: 'Invalid email format' }, { status: 400 });
    }

    const ses = new SESClient({
      region: 'us-east-2',
      credentials: {
        accessKeyId: process.env.ACCESS_KEY_ID!,
        secretAccessKey: process.env.SECRET_ACCESS_KEY!,
      },
    });

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
    const result = await ses.send(command);

    return NextResponse.json({
      success: true,
      messageId: result.MessageId,
    });
  } catch (error: any) {
    console.error('Error sending email:', error);
    return NextResponse.json(
      {
        error: 'Failed to send email',
        details: error.message,
      },
      { status: 500 }
    );
  }
}
