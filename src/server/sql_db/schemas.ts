

export interface Database {
  allTrustControls: {
    id: any;
    category?: string;
    short?: string;
    long?: string;
    createdAt?: Date;
    createdBy?: string;
    updatedAt?: Date;
    updatedBy?: string;
  };
  allTrustFaqs: {
    id: any;
    question?: string;
    answer?: string;
    createdAt?: Date;
    createdBy?: string;
    updatedAt?: Date;
    updatedBy?: string;
  };
}
