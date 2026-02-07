
import { LeaveOverview } from "./LeaveOverview";
import { MyLeaveRequests } from "./MyLeaveRequests";
import { LeaveRequestsPage } from "./LeaveRequestsPage";
import { LeaveTypesPage } from "./LeaveTypesPage";
import { AssignedLeavesPage } from "./AssignedLeavesPage";
import { LeaveAllocationRequestsPage } from "./LeaveAllocationRequestsPage";

interface LeaveDashboardProps {
  subPage?: string;
  onSubPageChange?: (subPage: string) => void;
}

export function LeaveDashboard({ subPage = "dashboard", onSubPageChange }: LeaveDashboardProps) {
  const navigate = (page: string) => onSubPageChange?.(page);

  switch (subPage) {
    case "my-requests":
      return <MyLeaveRequests onCreateRequest={() => navigate("requests")} />;
    case "requests":
      return <LeaveRequestsPage />;
    case "types":
      return <LeaveTypesPage />;
    case "assigned":
      return <AssignedLeavesPage />;
    case "allocation-requests":
      return <LeaveAllocationRequestsPage />;
    default:
      return <LeaveOverview onNavigate={navigate} />;
  }
}
