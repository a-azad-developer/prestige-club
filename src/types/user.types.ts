export interface CreateUserBody {
  name: string;
  age: number;
  city: string;
  educationLevel: string;
  goals: string[];
  score_selfGrowth: number;
}

export interface PaginationQuery {
  page: number;
  limit: number;
}

export interface MatchResult {
  userId: string;
  name: string;
  age: number;
  city: string;
  educationLevel: string;
  goals: string[];
  score_selfGrowth: number;
  compatibilityScore: number;
}

export interface UserParams {
  id: string;
}
