export interface FieldData {
  raw: string;
  value: number;
}

export interface HouseholdState {
  assetKeys: string[];
  assets: Record<string, FieldData>;
  incomeCategories: string[];
  incomeDestinations: Record<string, string>;
  expenseCategories: string[];
  expenseDestinations?: Record<string, string>;
  expenses: Record<string, Record<string, FieldData>>;
  income: Record<string, Record<string, FieldData>>;
  activeMonth: string;
}

export interface UserAccount {
  id: string;
  name: string;
  birthDate: string;
  passwordHash: string;
  createdAt: number;
  lastLoginAt: number;
}


