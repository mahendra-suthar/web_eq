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
  async getMyReviews(
    limit = 10,
    offset = 0,
    search?: string,
    rating?: number,
  ): Promise<MyReviewsResponse> {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (search) params.set('search', search);
    if (rating !== undefined) params.set('rating', String(rating));
    return this.get<MyReviewsResponse>(`/review/my_reviews?${params.toString()}`);
  }
}
