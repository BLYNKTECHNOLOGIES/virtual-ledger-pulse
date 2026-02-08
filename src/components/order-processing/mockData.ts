
export interface P2POrder {
  id: string;
  orderId: string;
  amount: number;
  buyerName: string;
  buyerEmail: string;
  paymentMethod: string;
  status: 'Pending' | 'Processing' | 'Completed';
  assignedTo: string | null;
  orderType: 'small' | 'large';
  createdAt: string;
}

export interface OPStaffMember {
  id: string;
  name: string;
  email: string;
  role: 'SMALL_SALES' | 'LARGE_SALES' | 'ADMIN';
  isActive: boolean;
  activeOrders: number;
  completedOrders: number;
}

export interface OPSystemSettings {
  smallOrderMax: number;
  largeOrderMin: number;
  rotationOrder: string[];
}

// Mock orders
export const mockOrders: P2POrder[] = [
  { id: '1', orderId: 'BNP2P-001', amount: 350, buyerName: 'Rahul Sharma', buyerEmail: 'rahul@email.com', paymentMethod: 'UPI', status: 'Pending', assignedTo: null, orderType: 'small', createdAt: new Date().toISOString() },
  { id: '2', orderId: 'BNP2P-002', amount: 499, buyerName: 'Priya Singh', buyerEmail: 'priya@email.com', paymentMethod: 'UPI', status: 'Processing', assignedTo: 'User A', orderType: 'small', createdAt: new Date(Date.now() - 3600000).toISOString() },
  { id: '3', orderId: 'BNP2P-003', amount: 150, buyerName: 'Amit Kumar', buyerEmail: 'amit@email.com', paymentMethod: 'UPI', status: 'Completed', assignedTo: 'User A', orderType: 'small', createdAt: new Date(Date.now() - 7200000).toISOString() },
  { id: '4', orderId: 'BNP2P-004', amount: 275, buyerName: 'Sneha Patel', buyerEmail: 'sneha@email.com', paymentMethod: 'UPI', status: 'Pending', assignedTo: null, orderType: 'small', createdAt: new Date(Date.now() - 1800000).toISOString() },
  { id: '5', orderId: 'BNP2P-005', amount: 425, buyerName: 'Vikram Mehta', buyerEmail: 'vikram@email.com', paymentMethod: 'UPI', status: 'Processing', assignedTo: 'User A', orderType: 'small', createdAt: new Date(Date.now() - 900000).toISOString() },
  { id: '6', orderId: 'BNP2P-101', amount: 70000, buyerName: 'Rajesh Gupta', buyerEmail: 'rajesh@business.com', paymentMethod: 'Bank Transfer', status: 'Pending', assignedTo: 'User B', orderType: 'large', createdAt: new Date().toISOString() },
  { id: '7', orderId: 'BNP2P-102', amount: 125000, buyerName: 'Suresh Enterprises', buyerEmail: 'suresh@enterprise.com', paymentMethod: 'Bank Transfer', status: 'Processing', assignedTo: 'User C', orderType: 'large', createdAt: new Date(Date.now() - 3600000).toISOString() },
  { id: '8', orderId: 'BNP2P-103', amount: 85000, buyerName: 'Anita Corp', buyerEmail: 'anita@corp.com', paymentMethod: 'Bank Transfer', status: 'Completed', assignedTo: 'User D', orderType: 'large', createdAt: new Date(Date.now() - 7200000).toISOString() },
  { id: '9', orderId: 'BNP2P-104', amount: 200000, buyerName: 'Global Investments', buyerEmail: 'global@invest.com', paymentMethod: 'Bank Transfer', status: 'Pending', assignedTo: 'User B', orderType: 'large', createdAt: new Date(Date.now() - 1200000).toISOString() },
  { id: '10', orderId: 'BNP2P-105', amount: 55000, buyerName: 'Kapoor Traders', buyerEmail: 'kapoor@traders.com', paymentMethod: 'Bank Transfer', status: 'Processing', assignedTo: 'User C', orderType: 'large', createdAt: new Date(Date.now() - 600000).toISOString() },
  { id: '11', orderId: 'BNP2P-106', amount: 92000, buyerName: 'Singh Holdings', buyerEmail: 'singh@holdings.com', paymentMethod: 'Bank Transfer', status: 'Pending', assignedTo: 'User D', orderType: 'large', createdAt: new Date(Date.now() - 300000).toISOString() },
];

export const mockStaff: OPStaffMember[] = [
  { id: '1', name: 'User A (Small Sales)', email: 'usera@binance.com', role: 'SMALL_SALES', isActive: true, activeOrders: 2, completedOrders: 1 },
  { id: '2', name: 'User B (Large Sales)', email: 'userb@binance.com', role: 'LARGE_SALES', isActive: true, activeOrders: 0, completedOrders: 0 },
  { id: '3', name: 'User C (Large Sales)', email: 'userc@binance.com', role: 'LARGE_SALES', isActive: true, activeOrders: 2, completedOrders: 0 },
  { id: '4', name: 'User D (Large Sales)', email: 'userd@binance.com', role: 'LARGE_SALES', isActive: true, activeOrders: 0, completedOrders: 1 },
];

export const defaultSettings: OPSystemSettings = {
  smallOrderMax: 500,
  largeOrderMin: 50000,
  rotationOrder: ['User B', 'User C', 'User D'],
};
