import React, { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  X, 
  Send, 
  MessageCircle, 
  HelpCircle, 
  ArrowLeft,
  Clock,
  CheckCircle,
  User,
  Bot,
  Search
} from 'lucide-react';

interface Message {
  id: string;
  type: 'user' | 'bot' | 'system';
  content: string;
  timestamp: Date;
}

interface LiveChatProps {
  isOpen: boolean;
  onClose: () => void;
}

export function LiveChat({ isOpen, onClose }: LiveChatProps) {
  const [currentView, setCurrentView] = useState<'menu' | 'chat' | 'faq'>('menu');
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      type: 'system',
      content: 'Welcome to Blynk Support! How can we help you today?',
      timestamp: new Date()
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const faqs = [
    {
      category: 'Account & KYC',
      questions: [
        {
          question: 'How do I complete my KYC verification?',
          answer: 'To complete KYC: 1) Go to Profile → KYC Section 2) Upload required documents (Aadhar, PAN, Bank proof) 3) Complete video verification if required 4) Wait for approval (usually 24-48 hours)'
        },
        {
          question: 'Why was my KYC rejected?',
          answer: 'Common reasons: 1) Blurry/unclear documents 2) Document mismatch with profile info 3) Expired documents 4) Poor lighting in selfie. Please re-upload clear, valid documents.'
        },
        {
          question: 'How to increase my trading limits?',
          answer: 'Higher limits require: 1) Complete KYC verification 2) Bank account verification 3) Transaction history 4) Contact relationship manager for enterprise limits'
        }
      ]
    },
    {
      category: 'Payments & Transactions',
      questions: [
        {
          question: 'How do I buy USDT with INR?',
          answer: 'Steps: 1) Login to your account 2) Go to Buy USDT page 3) Enter amount 4) Select payment method (UPI/IMPS/NEFT) 5) Complete payment 6) USDT credited within 10 minutes'
        },
        {
          question: 'My transaction failed, what to do?',
          answer: 'If payment failed: 1) Check bank account for deduction 2) Screenshot payment confirmation 3) Contact support with transaction ID 4) Refund processed within 3-5 business days'
        },
        {
          question: 'Can I use a third-party payment account?',
          answer: 'No, you can only use bank accounts registered in your name and verified during KYC. Third-party payments are not allowed for compliance reasons.'
        }
      ]
    },
    {
      category: 'Security & Compliance',
      questions: [
        {
          question: 'Is Blynk regulated and safe?',
          answer: 'Yes, Blynk is a registered VASP (Virtual Asset Service Provider) in India. We follow all AML/KYC regulations and maintain highest security standards.'
        },
        {
          question: 'How to enable 2FA security?',
          answer: 'Enable 2FA: 1) Go to Settings → Security 2) Download Google Authenticator 3) Scan QR code 4) Enter verification code 5) Save backup codes safely'
        },
        {
          question: 'What are crypto tax rules in India?',
          answer: 'Crypto gains are taxed at 30% + cess. TDS of 1% on transactions above ₹10,000. Maintain proper records. Consult tax advisor for detailed guidance.'
        }
      ]
    }
  ];

  const quickActions = [
    {
      icon: MessageCircle,
      title: 'Start Live Chat',
      description: 'Connect with our support team',
      action: () => setCurrentView('chat')
    },
    {
      icon: HelpCircle,
      title: 'Browse FAQ',
      description: 'Find answers to common questions',
      action: () => setCurrentView('faq')
    }
  ];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async () => {
    if (!inputValue.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      content: inputValue,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsTyping(true);

    // Simulate bot response
    setTimeout(() => {
      const botResponse: Message = {
        id: (Date.now() + 1).toString(),
        type: 'bot',
        content: getBotResponse(inputValue),
        timestamp: new Date()
      };
      setMessages(prev => [...prev, botResponse]);
      setIsTyping(false);
    }, 1500);
  };

  const getBotResponse = (input: string): string => {
    const lowerInput = input.toLowerCase();
    
    // Greetings
    if (lowerInput.includes('hello') || lowerInput.includes('hi') || lowerInput.includes('hey')) {
      const greetings = [
        'Hello! Welcome to Blynk support. How can I assist you today?',
        'Hi there! I\'m here to help you with any questions about Blynk services.',
        'Hey! Thanks for reaching out. What can I help you with?'
      ];
      return greetings[Math.floor(Math.random() * greetings.length)];
    }
    
    // KYC related
    if (lowerInput.includes('kyc') || lowerInput.includes('verification') || lowerInput.includes('documents')) {
      const kycResponses = [
        'For KYC verification, please upload clear documents (Aadhar, PAN, Bank proof) in your profile. The process usually takes 24-48 hours. Need specific help with your KYC status?',
        'KYC verification is simple! Upload your Aadhar, PAN, and bank proof. Make sure documents are clear and not expired. Any specific KYC issues you\'re facing?',
        'Having trouble with KYC? Ensure your documents are clear, colored, and match your profile information. Feel free to share your specific concern!'
      ];
      return kycResponses[Math.floor(Math.random() * kycResponses.length)];
    }
    
    // Trading/buying related
    if (lowerInput.includes('buy') || lowerInput.includes('usdt') || lowerInput.includes('purchase') || lowerInput.includes('trade')) {
      const tradingResponses = [
        'To buy USDT: 1) Go to Buy USDT page 2) Enter amount 3) Choose payment method 4) Complete payment. USDT is credited within 10 minutes. Current rate is ₹89.69 per USDT.',
        'Ready to buy crypto? You can purchase USDT instantly with UPI, IMPS, or NEFT. Current rate: ₹89.69/USDT. Minimum order: ₹100. Need help with the process?',
        'Buying USDT is easy! Select amount → Choose payment → Complete transaction → Get USDT in 10 mins. What amount are you looking to purchase?'
      ];
      return tradingResponses[Math.floor(Math.random() * tradingResponses.length)];
    }
    
    // Issues/problems
    if (lowerInput.includes('failed') || lowerInput.includes('problem') || lowerInput.includes('issue') || lowerInput.includes('error')) {
      const issueResponses = [
        'Sorry to hear about the issue! Please share your transaction ID and details. Our team will investigate and resolve this within 24 hours.',
        'I understand you\'re facing a problem. Can you share more details about what happened? Transaction ID would be helpful too.',
        'Let me help you resolve this! Please provide your transaction details or error message, and I\'ll escalate to our technical team immediately.'
      ];
      return issueResponses[Math.floor(Math.random() * issueResponses.length)];
    }
    
    // Limits
    if (lowerInput.includes('limit') || lowerInput.includes('increase') || lowerInput.includes('maximum')) {
      const limitResponses = [
        'To increase limits: 1) Complete full KYC 2) Verify bank account 3) Build transaction history 4) For corporate limits, contact our relationship manager. What specific limit are you looking to increase?',
        'Higher trading limits available after KYC completion! Corporate clients can get unlimited trading with our enterprise solutions. Need details about specific limits?',
        'Current limits depend on your KYC status. Verified users get higher limits. For bulk trading (₹5L+), we offer special rates and dedicated support!'
      ];
      return limitResponses[Math.floor(Math.random() * limitResponses.length)];
    }
    
    // Fees/rates
    if (lowerInput.includes('fee') || lowerInput.includes('rate') || lowerInput.includes('price') || lowerInput.includes('cost')) {
      const feeResponses = [
        'Our rates are highly competitive! Current USDT rate: ₹89.69. Zero hidden fees. For bulk orders (₹5L+), get even better negotiated rates!',
        'Transparent pricing with live market rates! USDT: ₹89.69, zero processing fees for UPI payments. Bulk traders get special rates!',
        'Best rates in the market! Current: ₹89.69/USDT. Corporate clients get customized pricing. Check our fees page for complete details.'
      ];
      return feeResponses[Math.floor(Math.random() * feeResponses.length)];
    }
    
    // Security
    if (lowerInput.includes('safe') || lowerInput.includes('secure') || lowerInput.includes('security') || lowerInput.includes('2fa')) {
      const securityResponses = [
        'Blynk is 100% secure! We\'re a registered VASP with bank-grade security, 2FA authentication, and full regulatory compliance. Your funds are always safe.',
        'Security is our priority! We use advanced encryption, cold storage for crypto, and follow all RBI guidelines. Enable 2FA for extra protection!',
        'Your security matters! Multi-layer protection, regulated operations, and 24/7 monitoring. We\'re fully compliant with Indian crypto regulations.'
      ];
      return securityResponses[Math.floor(Math.random() * securityResponses.length)];
    }
    
    // Generic responses for unmatched queries
    const genericResponses = [
      'I\'m here to help! Could you please provide more details about your question?',
      'Thanks for reaching out! Let me connect you with the right information. What specifically would you like to know?',
      'Great question! I\'d be happy to assist. Could you share more details so I can provide the best help?',
      'I want to make sure I give you the most accurate information. Can you tell me more about what you\'re looking for?',
      'Let me help you with that! For personalized assistance, you can also reach our human agents at support@blynkvirtual.com'
    ];
    
    return genericResponses[Math.floor(Math.random() * genericResponses.length)];
  };

  const filteredFAQs = faqs.map(category => ({
    ...category,
    questions: category.questions.filter(faq =>
      faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      faq.answer.toLowerCase().includes(searchQuery.toLowerCase())
    )
  })).filter(category => category.questions.length > 0);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <Card className="w-full max-w-md h-[600px] mx-4 flex flex-col">
        <CardHeader className="flex-shrink-0 bg-primary text-primary-foreground">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {currentView !== 'menu' && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setCurrentView('menu')}
                  className="text-primary-foreground hover:bg-primary-foreground/20"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              )}
              <div>
                <CardTitle className="text-lg">
                  {currentView === 'menu' ? 'Support Center' : 
                   currentView === 'chat' ? 'Live Chat' : 'FAQ Help'}
                </CardTitle>
                <div className="flex items-center gap-2 text-sm text-primary-foreground/80">
                  <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                  <span>Online • Avg response: 2 mins</span>
                </div>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="text-primary-foreground hover:bg-primary-foreground/20"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>

        <CardContent className="flex-1 p-0 flex flex-col overflow-hidden">
          {/* Menu View */}
          {currentView === 'menu' && (
            <div className="p-6 flex-1">
              <div className="text-center mb-6">
                <h3 className="text-lg font-semibold text-foreground mb-2">How can we help you?</h3>
                <p className="text-sm text-muted-foreground">
                  Choose an option below to get started
                </p>
              </div>

              <div className="space-y-4">
                {quickActions.map((action, index) => (
                  <Card 
                    key={index} 
                    className="cursor-pointer hover:shadow-md transition-shadow border-2 hover:border-primary/20"
                    onClick={action.action}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                          <action.icon className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <h4 className="font-medium text-foreground">{action.title}</h4>
                          <p className="text-sm text-muted-foreground">{action.description}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <div className="mt-6 text-center">
                <p className="text-xs text-muted-foreground mb-2">
                  Need immediate assistance?
                </p>
                <div className="space-y-1 text-xs text-muted-foreground">
                  <p>📧 support@blynkvirtual.com</p>
                  <p>📞 +91-XXXXXXXXXX</p>
                </div>
              </div>
            </div>
          )}

          {/* Chat View */}
          {currentView === 'chat' && (
            <>
              <ScrollArea className="flex-1 p-4">
                <div className="space-y-4">
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[80%] rounded-lg p-3 ${
                          message.type === 'user'
                            ? 'bg-primary text-primary-foreground'
                            : message.type === 'system'
                            ? 'bg-muted text-muted-foreground text-center'
                            : 'bg-muted text-foreground'
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          {message.type !== 'user' && message.type !== 'system' && (
                            <Bot className="h-4 w-4 mt-0.5 text-primary" />
                          )}
                          <div className="flex-1">
                            <p className="text-sm">{message.content}</p>
                            <p className="text-xs opacity-70 mt-1">
                              {message.timestamp.toLocaleTimeString([], { 
                                hour: '2-digit', 
                                minute: '2-digit' 
                              })}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                  
                  {isTyping && (
                    <div className="flex justify-start">
                      <div className="bg-muted text-foreground rounded-lg p-3 max-w-[80%]">
                        <div className="flex items-center gap-2">
                          <Bot className="h-4 w-4 text-primary" />
                          <div className="flex gap-1">
                            <div className="w-2 h-2 bg-primary rounded-full animate-bounce" />
                            <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                            <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>
              </ScrollArea>

              <div className="p-4 border-t">
                <div className="flex gap-2">
                  <Input
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                    placeholder="Type your message..."
                    className="flex-1"
                  />
                  <Button onClick={sendMessage} size="sm">
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          )}

          {/* FAQ View */}
          {currentView === 'faq' && (
            <>
              <div className="p-4 border-b">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search FAQ..."
                    className="pl-10"
                  />
                </div>
              </div>

              <ScrollArea className="flex-1">
                <div className="p-4 space-y-6">
                  {filteredFAQs.map((category) => (
                    <div key={category.category}>
                      <h3 className="font-semibold text-foreground mb-3">
                        {category.category}
                      </h3>
                      <div className="space-y-3">
                        {category.questions.map((faq, index) => (
                          <Card key={index} className="border-l-4 border-l-primary/20">
                            <CardContent className="p-4">
                              <h4 className="font-medium text-foreground mb-2 text-sm">
                                Q: {faq.question}
                              </h4>
                              <p className="text-sm text-muted-foreground leading-relaxed">
                                A: {faq.answer}
                              </p>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </div>
                  ))}

                  {filteredFAQs.length === 0 && searchQuery && (
                    <div className="text-center py-8">
                      <HelpCircle className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                      <p className="text-muted-foreground">
                        No FAQs found for "{searchQuery}"
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-2"
                        onClick={() => setCurrentView('chat')}
                      >
                        Start Live Chat
                      </Button>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}