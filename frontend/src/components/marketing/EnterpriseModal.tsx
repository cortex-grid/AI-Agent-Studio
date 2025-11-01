import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Check } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface EnterpriseModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const differentiators = [
  {
    title: "Dedicated onboarding",
    description:
      "Partner with our solutions architects to migrate existing agent graphs, tools, and playbooks in weeks instead of months.",
  },
  {
    title: "Flexible deployment",
    description:
      "Run CortexGrid agents on managed infrastructure or ship to your own Azure Container Apps, AKS, or on-prem clusters.",
  },
  {
    title: "Governance & compliance",
    description:
      "Audit trails, change explanations, workspace policies, and SOC2/ISO 27001 in-flight. HIPAA and FedRAMP support available.",
  },
  {
    title: "Custom connectors",
    description:
      "Our integration team builds secure connectors to your line-of-business systems, data lakes, and business applications.",
  },
];

const stats = [
  { value: "45%", label: "Faster agent delivery" },
  { value: "90%", label: "Prototype reuse across teams" },
  { value: "24/7", label: "Global support response" },
];

export const EnterpriseModal = ({ open, onOpenChange }: EnterpriseModalProps) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl border border-white/10 bg-[#08090f] text-white sm:max-h-[90vh]">
        <DialogHeader className="space-y-3 text-left">
          <DialogTitle className="text-3xl font-semibold leading-tight">CortexGrid Enterprise</DialogTitle>
          <DialogDescription className="text-sm text-white/60">
            Trusted by regulated teams accelerating AI agent delivery across customer support, operations, and R&D.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[72vh]">
          <div className="grid gap-8 md:grid-cols-[2fr,1fr]">
          <div className="space-y-8">
            <section className="space-y-4">
              <Badge className="bg-primary/20 text-primary">Enterprise-ready</Badge>
              <h2 className="text-2xl font-semibold text-white">
                Platform scale, governance, and support for mission-critical agent teams.
              </h2>
              <p className="text-sm text-white/70">
                From bank-grade security to co-development of bespoke connectors, CortexGrid Enterprise equips your
                organisation with the guardrails and expertise required to safely deploy autonomous workflows.
              </p>
            </section>

            <section className="grid gap-6 md:grid-cols-2">
              {differentiators.map((item) => (
                <div key={item.title} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <h3 className="text-sm font-semibold text-white">{item.title}</h3>
                  <p className="mt-2 text-xs text-white/60 leading-relaxed">{item.description}</p>
                </div>
              ))}
            </section>

            <section className="rounded-3xl border border-primary/20 bg-primary/5 p-6">
              <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-sm uppercase tracking-wide text-primary/80">Customer spotlight</p>
                  <h4 className="mt-2 text-lg font-semibold text-white">Northwind Global Support</h4>
                  <p className="text-sm text-white/70">
                    “CortexGrid helped us consolidate eight regional agent teams into a unified workspace, delivering
                    AI-assisted resolutions with compliance-ready audit trails.”
                  </p>
                </div>
                <Avatar className="h-14 w-14 border border-white/10">
                  <AvatarFallback className="bg-primary text-primary-foreground text-lg font-semibold">
                    NG
                  </AvatarFallback>
                </Avatar>
              </div>
            </section>
          </div>

          <aside className="space-y-6 rounded-3xl border border-white/10 bg-white/5 p-6">
            <div className="space-y-2">
              <p className="text-sm font-medium text-white">Flexible enterprise plans</p>
              <p className="text-xs text-white/60">
                Tailored pricing based on seats, workloads, and compliance requirements.
              </p>
            </div>

            <div className="space-y-4">
              {stats.map((stat) => (
                <div key={stat.label} className="rounded-2xl border border-white/10 bg-black/40 p-4">
                  <p className="text-2xl font-semibold text-white">{stat.value}</p>
                  <p className="text-xs text-white/60">{stat.label}</p>
                </div>
              ))}
            </div>

            <div className="space-y-3 text-sm text-white/70">
              <div className="flex items-center gap-2">
                <Check className="h-4 w-4 text-primary" />
                <span>Dedicated solutions architect & success manager</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="h-4 w-4 text-primary" />
                <span>Priority triage with 24/7 global support</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="h-4 w-4 text-primary" />
                <span>In-region & on-prem deployment options</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="h-4 w-4 text-primary" />
                <span>Executive business reviews & roadmap input</span>
              </div>
          </div>
            <Button className="w-full bg-primary text-primary-foreground hover:bg-primary/90">
              Talk to our team
            </Button>
            <Button variant="outline" className="w-full border-white/20 bg-transparent text-white hover:bg-white/10">
              Download enterprise brief
            </Button>
          </aside>
        </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};
