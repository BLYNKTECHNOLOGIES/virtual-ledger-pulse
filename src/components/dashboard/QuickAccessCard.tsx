
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Package, Users, ShoppingCart } from "lucide-react";
import { Link } from "react-router-dom";

interface QuickAccessCardProps {
  title: string;
  description: string;
  href: string;
  icon: string;
}

const iconMap = {
  plus: Plus,
  package: Package,
  users: Users,
  "shopping-cart": ShoppingCart,
};

export function QuickAccessCard({ title, description, href, icon }: QuickAccessCardProps) {
  const IconComponent = iconMap[icon as keyof typeof iconMap] || Plus;

  return (
    <Card className="h-full hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 rounded-lg">
            <IconComponent className="h-5 w-5 text-blue-600" />
          </div>
          <CardTitle className="text-lg font-semibold">{title}</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <p className="text-sm text-gray-600 mb-4">{description}</p>
        <Link to={href}>
          <Button className="w-full" size="sm">
            Get Started
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}
