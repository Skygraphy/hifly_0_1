import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

// Einziger Ort mit SES-Client-Instanziierung — gleiches Singleton-Muster wie
// getS3Client() in src/lib/s3.ts, wiederverwendet dieselben AWS-Zugangsdaten
// (AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY), da AWS ohnehin schon Teil des
// Stacks ist (siehe Konzept-Plan Abschnitt 10).
let client: SESClient | undefined;

function getSesClient(): SESClient {
  if (!client) {
    client = new SESClient({
      region: process.env.AWS_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    });
  }
  return client;
}

export async function sendEmail(params: { to: string; subject: string; html: string; text: string }): Promise<void> {
  const fromEmail = process.env.SES_FROM_EMAIL;
  if (!fromEmail) throw new Error("SES_FROM_EMAIL ist nicht gesetzt.");

  await getSesClient().send(
    new SendEmailCommand({
      Source: fromEmail,
      Destination: { ToAddresses: [params.to] },
      Message: {
        Subject: { Data: params.subject, Charset: "UTF-8" },
        Body: {
          Html: { Data: params.html, Charset: "UTF-8" },
          Text: { Data: params.text, Charset: "UTF-8" },
        },
      },
    })
  );
}
