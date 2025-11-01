import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

interface PricingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface PricingTier {
  id: string;
  title: string;
  subtitle: string;
  monthly: number | "custom";
  annual?: number;
  cta: string;
  description: string;
  features: string[];
  accent?: "primary" | "secondary";
}

export const PricingModal = ({ open, onOpenChange }: PricingModalProps) => {
  const [annual, setAnnual] = useState(false);

  const tiers = useMemo<PricingTier[]>(
    () => [
      {
        id: "pro",
        title: "Pro",
        subtitle: "Fast-moving teams designing together in real-time.",
        monthly: 25,
        annual: 20,
        cta: "Upgrade",
        description: "Shared credits across unlimited makers.",
        features: [
          "100 monthly credits included",
          "Unlimited collaborators",
          "Hosted code + AI sandbox",
          "Custom domains & branding",
          "Remove CortexGrid badge",
        ],
        accent: "primary",
      },
      {
        id: "business",
        title: "Business",
        subtitle: "Advanced controls for scaling departments.",
        monthly: 50,
        annual: 42,
        cta: "Upgrade",
        description: "Everything in Pro plus power-user features.",
        features: [
          "SSO & SCIM provisioning",
          "Personal projects & sandboxes",
          "Private playbooks & templates",
          "Team-based access control",
          "Opt-out of data training",
        ],
      },
      {
        id: "enterprise",
        title: "Enterprise",
        subtitle: "Flexible plans for regulated or global orgs.",
        monthly: "custom",
        cta: "Book a demo",
        description: "Tailored onboarding with compliance support.",
        features: [
          "Dedicated success manager",
          "Custom connections & on-prem adapters",
          "Gov & multi-region cloud options",
          "Granular audit & change history",
          "Custom deployment playbooks",
        ],
      },
    ],
    []
  );

  const formatPrice = (tier: PricingTier) => {
    if (tier.monthly === "custom") return "Custom";
    const price = annual ? tier.annual ?? tier.monthly : tier.monthly;
    return `$${price}`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl border border-white/10 bg-[#08090f] text-white sm:max-h-[90vh]">
        <DialogHeader className="text-left space-y-2">
          <DialogTitle className="text-2xl font-semibold">Plans & credits</DialogTitle>
          <DialogDescription className="text-sm text-white/60">
            Choose the workspace plan that fits your team. Credits are shared across users and power cloud execution,
            hosted tools, and AI generation.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[72vh]">
          <div className="flex flex-col gap-6 md:flex-row">
            <aside className="w-full rounded-2xl border border-white/10 bg-white/5 p-5 md:w-64">
              <div className="space-y-6 text-sm text-white/70">
                <div>
                  <p className="uppercase text-xs tracking-wider text-white/50 mb-2">Workspace</p>
                  <p className="font-medium text-white">CortexGrid Studio</p>
                </div>

                <div>
                  <p className="uppercase text-xs tracking-wider text-white/50 mb-2">Account</p>
                  <ul className="space-y-2">
                    <li className="flex items-center gap-2 text-white/80">Your Account</li>
                    <li className="flex items-center gap-2 text-white/80">Team Members</li>
                    <li className="flex items-center gap-2 text-white/80">Tool Catalog</li>
                    <li className="flex items-center gap-2 text-white/80">Labs & Early Access</li>
                  </ul>
                </div>

                <div>
                  <p className="uppercase text-xs tracking-wider text-white/50 mb-2">Integrations</p>
                  <ul className="space-y-2">
                    <li className="flex items-center gap-2 text-white/80">Supabase</li>
                    <li className="flex items-center gap-2 text-white/80">Azure Entra</li>
                    <li className="flex items-center gap-2 text-white/80">GitHub</li>
                    <li className="flex items-center gap-2 text-white/80">Model Context Protocol</li>
                  </ul>
                </div>
              </div>
            </aside>

            <section className="flex-1 space-y-6 overflow-y-auto pr-1">
              <div className="flex items-center justify-end gap-2 text-sm text-white/70">
                <span>Monthly</span>
                <Switch checked={annual} onCheckedChange={setAnnual} />
                <span>Annual</span>
                {annual && (
                  <Badge variant="outline" className="border-primary/40 text-primary ml-2">
                    Save up to 20%
                  </Badge>
                )}
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                {tiers.map((tier) => (
                  <div
                    key={tier.id}
                    className="flex flex-col rounded-2xl border border-white/10 bg-gradient-to-b from-white/10 to-transparent p-6 shadow-[0_30px_60px_-40px_rgba(56,189,248,.4)]"
                  >
                    <div className="space-y-3">
                      <h3 className="text-xl font-semibold text-white">{tier.title}</h3>
                      <p className="text-sm text-white/60">{tier.subtitle}</p>
                    </div>

                    <div className="mt-6 flex items-baseline gap-1">
                      <span className="text-3xl font-semibold text-white">{formatPrice(tier)}</span>
                      {tier.monthly !== "custom" && (
                        <span className="text-sm text-white/60">per workspace / month</span>
                      )}
                    </div>

                    {tier.monthly !== "custom" && (
                      <p className="text-xs text-white/50">
                        Billed {annual ? "annually" : "monthly"}. Switch above to compare savings.
                      </p>
                    )}

                    <Button
                      className={`mt-6 w-full ${
                        tier.accent === "primary"
                          ? "bg-primary text-primary-foreground hover:bg-primary/90"
                          : "bg-white/10 text-white hover:bg-white/20"
                      }`}
                    >
                      {tier.cta}
                    </Button>

                    <div className="mt-6">
                      <p className="text-xs uppercase tracking-wide text-white/50 mb-3">{tier.description}</p>
                      <ul className="space-y-2 text-sm text-white/70">
                        {tier.features.map((feature) => (
                          <li key={feature} className="flex items-start gap-2">
                            <span className="mt-1 block h-1.5 w-1.5 rounded-full bg-primary/80" />
                            <span>{feature}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};
