import { NextResponse } from "next/server";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

const ses = new SESClient({
  region: "us-east-2",
  credentials: {
    accessKeyId: process.env.ACCESS_KEY_ID!,
    secretAccessKey: process.env.SECRET_ACCESS_KEY!,
  },
});

export async function POST(request: Request) {
  try {
    const { name, email, message } = await request.json();

    const params = {
      Source: "contact@jcvolpe.me",
      Destination: {
        ToAddresses: ["volpestyle@gmail.com"],
      },
      Message: {
        Subject: {
          Data: `New message from ${name}`,
          Charset: "UTF-8",
        },
        Body: {
          Text: {
            Data: `Name: ${name}\nEmail: ${email}\nMessage: ${message}`,
            Charset: "UTF-8",
          },
          Html: {
            Data: `<p><strong>Name:</strong> ${name}</p>
                   <p><strong>Email:</strong> ${email}</p>
                   <p><strong>Message:</strong> ${message}</p>`,
            Charset: "UTF-8",
          },
        },
      },
    };

    const command = new SendEmailCommand(params);

    const result = await ses.send(command);
    console.log("Email sent successfully:", result);

    return NextResponse.json({ status: result.$metadata.httpStatusCode });
  } catch (error) {
    console.error("Error sending email:", error);
    return NextResponse.json({ error: "Error sending email" }, { status: 500 });
  }
}
