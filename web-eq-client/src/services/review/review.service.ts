import { HttpClient } from '../api/httpclient.service';

export interface ReviewData {
  uuid: string;
  user_id: string;
  business_id: string;
  employee_id?: string | null;
  rating: number;
  comment?: string | null;
  is_verified: boolean;
  user_name?: string | null;
  business_name?: string | null;
  created_at?: string | null;
}

export interface MyReviewsResponse {
  reviews: ReviewData[];
  avg_rating: number;
  review_count: number;
}

export class ReviewService extends HttpClient {
  async getMyReviews(limit = 10, offset = 0): Promise<MyReviewsResponse> {
    return this.get<MyReviewsResponse>(`/review/my_reviews?limit=${limit}&offset=${offset}`);
  }
}
