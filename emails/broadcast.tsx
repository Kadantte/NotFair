import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import type { BroadcastContent } from "@/lib/email/broadcast-content";

export type BroadcastEmailProps = {
  preheader?: string;
  content: BroadcastContent;
  unsubscribeUrl: string;
};

export function BroadcastEmail({ preheader, content, unsubscribeUrl }: BroadcastEmailProps) {
  return (
    <Html>
      <Head />
      {preheader ? <Preview>{preheader}</Preview> : null}
      <Body style={body}>
        <Container style={container}>
          {content.heading ? <Heading style={heading}>{content.heading}</Heading> : null}
          {content.greeting ? <Text style={paragraph}>{content.greeting}</Text> : null}
          {content.paragraphs.map((p, i) => (
            <Text key={i} style={paragraph}>
              {p}
            </Text>
          ))}
          {content.cta ? (
            <Section style={ctaSection}>
              <Button href={content.cta.href} style={ctaButton}>
                {content.cta.label}
              </Button>
            </Section>
          ) : null}
          {content.signature ? <Text style={paragraph}>{content.signature}</Text> : null}
          <Hr style={hr} />
          <Text style={footer}>
            You&apos;re getting this because you have a NotFair account.{" "}
            <Link href={unsubscribeUrl} style={footerLink}>
              Unsubscribe from product updates
            </Link>
            .
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default BroadcastEmail;

const body = {
  fontFamily:
    "ui-sans-serif, -apple-system, BlinkMacSystemFont, system-ui, Segoe UI, sans-serif",
  backgroundColor: "#f8f9fa",
  margin: 0,
  padding: 0,
} as const;

const container = {
  maxWidth: "560px",
  margin: "32px auto",
  padding: "32px",
  backgroundColor: "#ffffff",
  borderRadius: "12px",
} as const;

const heading = {
  fontSize: "20px",
  lineHeight: 1.3,
  color: "#111111",
  margin: "0 0 16px",
} as const;

const paragraph = {
  fontSize: "15px",
  lineHeight: 1.55,
  color: "#333333",
  margin: "0 0 16px",
} as const;

const ctaSection = { margin: "24px 0" } as const;

const ctaButton = {
  backgroundColor: "#111111",
  color: "#ffffff",
  padding: "12px 20px",
  borderRadius: "8px",
  fontSize: "14px",
  fontWeight: 600,
  textDecoration: "none",
  display: "inline-block",
} as const;

const hr = { borderColor: "#eeeeee", margin: "32px 0 16px" } as const;

const footer = {
  fontSize: "12px",
  lineHeight: 1.5,
  color: "#999999",
  margin: 0,
} as const;

const footerLink = { color: "#999999", textDecoration: "underline" } as const;
