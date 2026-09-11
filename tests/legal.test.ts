// @vitest-environment node
// AUTO-GENERATED verbatim spot-check strings — do not hand-edit the expect()
// literals below; regenerate from content/pages/en/*.json via the build
// script used during 71-08 execution if the source content changes. This
// guarantees byte-for-byte fidelity (NBSP/dash/quote transcription) without
// manual retyping risk.
import { describe, it, expect } from "vitest";
import { getPageContent } from "@/lib/page-content";
import { routing } from "@/i18n/routing";

const NON_EN_LOCALES = routing.locales.filter((l) => l !== "en");

type PrivacyContent = {
  metadata: { title: string; description: string; ogTitle: string };
  section1: { controllerName: string; controllerSuffix: string };
  section9: { authorityName: string };
};

type TermsContent = {
  metadata: { title: string; description: string; ogTitle: string };
  section1: { text: string };
  section4: { items: { label: string; desc: string }[] };
};

type DataDeletionContent = {
  metadata: { title: string; description: string };
  section1: { text: string };
  section3: { facebookLinkLabel: string };
};

describe("getPageContent('privacy')", () => {
  it("EN-fallback: every non-EN locale (all 7 configured locales) deep-equals the 'en' result, no 404", () => {
    const en = getPageContent("privacy", "en");
    for (const locale of NON_EN_LOCALES) {
      expect(getPageContent("privacy", locale)).toEqual(en);
    }
  });

  it("spot-checks 4 representative strings against verbatim originals, including the legal-entity line", () => {
    const content = getPageContent("privacy", "en") as PrivacyContent;
    expect(content.metadata.title).toBe(
      "Privacy Policy — PRESTIGO Premium Chauffeur Prague"
    );
    // Legal entity spot-check: company name transcribed verbatim
    expect(content.section1.controllerName).toBe("chelautotrans s.r.o.");
    // Legal entity spot-check: IČO + registered address transcribed verbatim (incl. NBSP before the IČO number)
    expect(content.section1.controllerSuffix).toBe(
      ", trading as PRESTIGO, with registered office at Spojovací 685, Vysoký Újezd, Czech Republic, IČO: 05650801."
    );
    expect(content.section9.authorityName).toBe(
      "Úřad pro ochranu osobních údajű"
    );
  });
});

describe("getPageContent('terms')", () => {
  it("EN-fallback: every non-EN locale (all 7 configured locales) deep-equals the 'en' result, no 404", () => {
    const en = getPageContent("terms", "en");
    for (const locale of NON_EN_LOCALES) {
      expect(getPageContent("terms", locale)).toEqual(en);
    }
  });

  it("spot-checks 4 representative strings against verbatim originals", () => {
    const content = getPageContent("terms", "en") as TermsContent;
    expect(content.metadata.title).toBe(
      "Terms of Service — PRESTIGO Premium Chauffeur Prague"
    );
    expect(content.section1.text).toBe(
      "PRESTIGO is a trading name of chelautotrans s.r.o. (IČO: 05650801, registered at Spojovací 685, Vysoký Újezd, Czech Republic). We provide premium chauffeur and private transfer services in Prague and Central Europe, including airport transfers, intercity routes, corporate transportation, VIP and event transport, and group transfers. By placing a booking, you agree to these terms."
    );
    expect(content.section4.items[0]).toEqual({
      label: "Free cancellation",
      desc: "Up to 1 hour before the scheduled pickup time — full refund, no questions asked.",
    });
    expect(content.section4.items[4].desc).toBe(
      "Refunds are returned to the original payment method within 5–10 business days."
    );
  });
});

describe("getPageContent('data-deletion')", () => {
  it("EN-fallback: every non-EN locale (all 7 configured locales) deep-equals the 'en' result, no 404", () => {
    const en = getPageContent("data-deletion", "en");
    for (const locale of NON_EN_LOCALES) {
      expect(getPageContent("data-deletion", locale)).toEqual(en);
    }
  });

  it("spot-checks 3 representative strings against verbatim originals", () => {
    const content = getPageContent("data-deletion", "en") as DataDeletionContent;
    expect(content.metadata.title).toBe(
      "Data Deletion — PRESTIGO Premium Chauffeur Prague"
    );
    expect(content.section1.text).toBe(
      "If you booked a transfer or submitted an enquiry, we hold your name, email address, phone number, and booking details. We also process anonymised website analytics data via Google Analytics and Meta Pixel. We do not store your Facebook user ID — the Meta Pixel only sends hashed behavioural data for ad measurement purposes."
    );
    expect(content.section3.facebookLinkLabel).toBe(
      "Facebook Settings → Apps and Websites"
    );
  });
});
