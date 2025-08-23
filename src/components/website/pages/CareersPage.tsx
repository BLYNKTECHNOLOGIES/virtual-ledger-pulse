import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useNavigate } from 'react-router-dom';
import { 
  Rocket, 
  TrendingUp, 
  Globe, 
  DollarSign, 
  GraduationCap,
  Users,
  Code,
  BarChart3,
  Shield,
  Monitor,
  Server,
  Briefcase,
  UserCheck,
  ExternalLink,
  ArrowRight,
  Building2,
  Zap
} from 'lucide-react';

export function CareersPage() {
  const navigate = useNavigate();

  const benefits = [
    {
      icon: Code,
      title: "Cutting-edge Technology",
      description: "Work on crypto & fintech products with modern tech stack"
    },
    {
      icon: TrendingUp,
      title: "Growth-focused Environment", 
      description: "Dynamic workplace with opportunities for rapid career advancement"
    },
    {
      icon: Globe,
      title: "Global Exposure",
      description: "24/7 international exposure with Binance, Bybit, Bitget platforms"
    },
    {
      icon: DollarSign,
      title: "Competitive Compensation",
      description: "Attractive salary packages with performance-based incentives"
    },
    {
      icon: GraduationCap,
      title: "Continuous Learning",
      description: "Flexible work culture with focus on skill development"
    }
  ];

  const jobOpenings = [
    {
      team: "Operations Team",
      icon: Users,
      color: "text-blue-600",
      bgColor: "bg-blue-50",
      positions: [
        {
          title: "P2P Trading Operator",
          description: "Manage live orders, customer queries, and ensure smooth execution",
          type: "Full-time",
          level: "Mid-level"
        },
        {
          title: "Compliance Associate", 
          description: "Handle KYC, AML, and corporate onboarding processes",
          type: "Full-time",
          level: "Entry-level"
        }
      ]
    },
    {
      team: "Tech & Product Team",
      icon: Code,
      color: "text-green-600", 
      bgColor: "bg-green-50",
      positions: [
        {
          title: "Frontend Developer",
          description: "Build intuitive UIs for our trading CRM using React + Tailwind",
          type: "Full-time",
          level: "Mid-level"
        },
        {
          title: "Backend Developer",
          description: "Manage APIs, automation & database flows with Node.js / Supabase",
          type: "Full-time",
          level: "Senior-level"
        }
      ]
    },
    {
      team: "Business & Strategy",
      icon: BarChart3,
      color: "text-purple-600",
      bgColor: "bg-purple-50", 
      positions: [
        {
          title: "Business Development Manager",
          description: "Expand B2B and corporate client base through strategic partnerships",
          type: "Full-time",
          level: "Senior-level"
        },
        {
          title: "Relationship Manager",
          description: "Manage high-volume traders with personalized support and guidance",
          type: "Full-time", 
          level: "Mid-level"
        }
      ]
    }
  ];

  const applicationSteps = [
    {
      step: "01",
      title: "Browse Openings",
      description: "Explore our current job opportunities and find the perfect fit for your skills",
      icon: Monitor
    },
    {
      step: "02", 
      title: "Submit Application",
      description: "Click Apply Now and submit your resume with a compelling cover letter",
      icon: Briefcase
    },
    {
      step: "03",
      title: "HR Review",
      description: "Our HR team (Priya Saxena & team) will review and contact shortlisted candidates",
      icon: UserCheck
    },
    {
      step: "04",
      title: "Join the Team",
      description: "Complete the interview process and become part of the Blynk family",
      icon: Users
    }
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <section className="relative py-20 px-4 bg-gradient-to-br from-primary/5 via-background to-secondary/5">
        <div className="max-w-4xl mx-auto text-center">
          <Badge variant="secondary" className="mb-6">
            <Briefcase className="w-4 h-4 mr-2" />
            Join Our Team
          </Badge>
          
          <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-6">
            Careers at <span className="text-primary">Blynk</span>
          </h1>
          
          <p className="text-xl text-muted-foreground mb-8 max-w-3xl mx-auto">
            At Blynk Virtual Technologies Pvt. Ltd., we're building the future of crypto trading and financial technology.
            Join us and be part of a fast-growing fintech revolution.
          </p>

          <div className="flex flex-wrap gap-4 justify-center">
            <Button 
              size="lg" 
              onClick={() => window.open('https://mudrex.freshteam.com/jobs', '_blank')}
              className="gap-2"
            >
              <ExternalLink className="w-5 h-5" />
              View Open Positions
              <ArrowRight className="w-4 h-4" />
            </Button>
            <Button 
              variant="outline" 
              size="lg"
              onClick={() => navigate('/website/whatsapp-support')}
              className="gap-2"
            >
              <Users className="w-5 h-5" />
              Contact HR
            </Button>
          </div>
        </div>
      </section>

      {/* Why Work With Us Section */}
      <section className="py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              Why Work With <span className="text-primary">Us</span>?
            </h2>
            <p className="text-lg text-muted-foreground">
              Experience the future of fintech in a dynamic, growth-focused environment
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {benefits.map((benefit, index) => {
              const Icon = benefit.icon;
              return (
                <Card key={index} className="h-full hover:shadow-lg transition-all duration-300">
                  <CardHeader>
                    <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                      <Icon className="w-6 h-6 text-primary" />
                    </div>
                    <CardTitle className="text-xl">{benefit.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground">{benefit.description}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* Current Openings Section */}
      <section className="py-20 px-4 bg-muted/30">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              Current Openings
            </h2>
            <p className="text-lg text-muted-foreground">
              Find the perfect role that matches your skills and passion
            </p>
          </div>

          <div className="space-y-12">
            {jobOpenings.map((team, teamIndex) => {
              const TeamIcon = team.icon;
              return (
                <div key={teamIndex}>
                  <div className="flex items-center gap-4 mb-8">
                    <div className={`w-12 h-12 rounded-full ${team.bgColor} flex items-center justify-center`}>
                      <TeamIcon className={`w-6 h-6 ${team.color}`} />
                    </div>
                    <h3 className="text-2xl font-bold text-foreground">{team.team}</h3>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {team.positions.map((position, posIndex) => (
                      <Card key={posIndex} className="hover:shadow-lg transition-all duration-300">
                        <CardHeader>
                          <div className="flex justify-between items-start mb-2">
                            <CardTitle className="text-xl">{position.title}</CardTitle>
                            <div className="flex gap-2">
                              <Badge variant="outline">{position.type}</Badge>
                              <Badge variant="secondary">{position.level}</Badge>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <p className="text-muted-foreground mb-6">{position.description}</p>
                          <Button 
                            className="w-full gap-2"
                            onClick={() => window.open('https://mudrex.freshteam.com/jobs', '_blank')}
                          >
                            <ExternalLink className="w-4 h-4" />
                            Apply Now
                          </Button>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* How to Apply Section */}
      <section className="py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              How to Apply
            </h2>
            <p className="text-lg text-muted-foreground">
              Simple steps to join the Blynk team
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {applicationSteps.map((step, index) => {
              const Icon = step.icon;
              return (
                <div key={index} className="text-center">
                  <div className="relative mb-6">
                    <div className="w-16 h-16 rounded-full bg-primary text-white flex items-center justify-center text-xl font-bold mx-auto mb-4">
                      {step.step}
                    </div>
                    <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                      <Icon className="w-6 h-6 text-primary" />
                    </div>
                  </div>
                  <h3 className="text-lg font-semibold text-foreground mb-3">{step.title}</h3>
                  <p className="text-muted-foreground text-sm">{step.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 bg-gradient-to-br from-primary/5 via-background to-secondary/5">
        <div className="max-w-4xl mx-auto text-center">
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
              <Rocket className="w-8 h-8 text-primary" />
            </div>
          </div>
          
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-6">
            Take the Leap
          </h2>
          
          <p className="text-xl text-muted-foreground mb-8 max-w-3xl mx-auto">
            At Blynk, you don't just do a job—you build the future of finance.
            Whether you're into trading, technology, or strategy, we have a place for you.
          </p>

          <div className="flex flex-wrap gap-4 justify-center">
            <Button 
              size="lg" 
              onClick={() => window.open('https://mudrex.freshteam.com/jobs', '_blank')}
              className="gap-2"
            >
              <Briefcase className="w-5 h-5" />
              Apply Now & Join the Blynk Team
              <ExternalLink className="w-4 h-4" />
            </Button>
          </div>
          
          <div className="mt-8 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Building2 className="w-4 h-4" />
            <span>Blynk Virtual Technologies – Empowering Crypto. Empowering Careers.</span>
          </div>
        </div>
      </section>

      {/* Company Stats */}
      <section className="py-16 px-4 border-t border-border/40">
        <div className="max-w-4xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            <div>
              <div className="text-3xl font-bold text-primary mb-2">50+</div>
              <div className="text-sm text-muted-foreground">Team Members</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-primary mb-2">24/7</div>
              <div className="text-sm text-muted-foreground">Operations</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-primary mb-2">1000+</div>
              <div className="text-sm text-muted-foreground">Happy Clients</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-primary mb-2">3+</div>
              <div className="text-sm text-muted-foreground">Global Exchanges</div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}