
import { BarChart, Users, FileText, Settings, Shield, TrendingUp } from 'lucide-react';
import { Link } from 'react-router-dom';

export function CRMDashboard() {
  const quickLinks = [
    { name: 'KYC Management', icon: Shield, link: '/kyc-approvals', color: 'bg-blue-500' },
    { name: 'Orders', icon: FileText, link: '/sales', color: 'bg-green-500' },
    { name: 'Transactions', icon: TrendingUp, link: '/accounting', color: 'bg-purple-500' },
    { name: 'Settings', icon: Settings, link: '/user-management', color: 'bg-orange-500' },
  ];

  const stats = [
    { title: 'Total Users', value: '1,234', change: '+12%', color: 'text-blue-600' },
    { title: 'Active Orders', value: '567', change: '+8%', color: 'text-green-600' },
    { title: 'Pending KYC', value: '89', change: '-5%', color: 'text-orange-600' },
    { title: 'Revenue', value: '₹45.6L', change: '+15%', color: 'text-purple-600' },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex justify-between items-center">
            <h1 className="text-3xl font-bold text-gray-900">
              Welcome to Blynk Virtual CRM Dashboard
            </h1>
            <div className="text-sm text-gray-500">
              Last updated: {new Date().toLocaleDateString()}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {stats.map((stat, index) => (
            <div key={index} className="bg-white rounded-xl shadow-lg p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">{stat.title}</p>
                  <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                </div>
                <div className={`text-sm font-medium ${stat.color}`}>
                  {stat.change}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Quick Links */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Quick Access</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {quickLinks.map((item, index) => (
              <Link
                key={index}
                to={item.link}
                className="bg-white rounded-xl shadow-lg p-8 hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-2"
              >
                <div className={`${item.color} w-16 h-16 rounded-lg flex items-center justify-center mb-6`}>
                  <item.icon className="h-8 w-8 text-white" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  {item.name}
                </h3>
                <p className="text-gray-600 text-sm">
                  Access {item.name.toLowerCase()} functionality
                </p>
              </Link>
            ))}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-white rounded-xl shadow-lg p-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Recent Activity</h2>
          <div className="space-y-4">
            {[
              { action: 'New KYC application submitted', user: 'John Doe', time: '2 minutes ago' },
              { action: 'Order #1234 completed', user: 'Jane Smith', time: '15 minutes ago' },
              { action: 'Transaction approved', user: 'Mike Johnson', time: '1 hour ago' },
              { action: 'User account verified', user: 'Sarah Wilson', time: '2 hours ago' },
            ].map((activity, index) => (
              <div key={index} className="flex items-center justify-between py-3 border-b border-gray-100 last:border-b-0">
                <div className="flex items-center space-x-3">
                  <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                  <div>
                    <p className="font-medium text-gray-900">{activity.action}</p>
                    <p className="text-sm text-gray-600">by {activity.user}</p>
                  </div>
                </div>
                <div className="text-sm text-gray-500">
                  {activity.time}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
