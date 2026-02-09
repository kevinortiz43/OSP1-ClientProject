

export interface Supabase {
  allTeams: {
    id: string;
    firstName?: string;
    lastName?: string;
    role?: string;
    email?: string;
    isActive?: boolean;
    employeeId?: number;
    responseTimeHours?: number;
    categories?: string[];
    searchText?: string;
    createdAt?: Date;
    createdBy?: string;
    updatedAt?: Date;
    updatedBy?: string;
  };
  allTrustControls: {
    id: string;
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
    id: string;
    question?: string;
    answer?: string;
    categories?: string[];
    searchText?: string;
    createdAt?: Date;
    createdBy?: string;
    updatedAt?: Date;
    updatedBy?: string;
  };
}
