

export interface Database {
  allTeams: {
    id: any;
    firstName?: string;
    lastName?: string;
    role?: string;
    email?: string;
    isActive?: string;
    employeeId?: number;
    responseTimeHours?: number;
    categories?: string;
    searchText?: string;
    createdAt?: Date;
    createdBy?: string;
    updatedAt?: Date;
    updatedBy?: string;
  };
  allTrustControls: {
    id: any;
    category?: string;
    short?: string;
    long?: string;
    searchText?: string;
    createdAt?: Date;
    createdBy?: string;
    updatedAt?: Date;
    updatedBy?: string;
  };
  allTrustFaqs: {
    id: any;
    question?: string;
    answer?: string;
    categories?: string;
    searchText?: string;
    createdAt?: Date;
    createdBy?: string;
    updatedAt?: Date;
    updatedBy?: string;
  };
}
