import { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { ReviewService, ReviewData } from '../../services/review/review.service';
import { ProfileService } from '../../services/profile/profile.service';
import { useUserStore } from '../../utils/userStore';
import { DEFAULT_PAGE, DEFAULT_DEBOUNCE_DELAY_MS } from '../../utils/constants';
import Pagination from '../../components/pagination';
import PageToolbar from '../../components/page-toolbar';
import './reviews.scss';

const PAGE_LIMIT = 10;

const StarDisplay = ({ rating }: { rating: number }) => {
  const filled = Math.round(rating);
  return (
    <div className="rv-stars" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={n <= filled ? 'rv-star rv-star--filled' : 'rv-star'}>
          ★
        </span>
      ))}
    </div>
  );
};

const getInitials = (name?: string | null) => {
  if (!name) return '?';
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
};

interface ReviewsPageProps {
  showBusiness?: boolean;
}

const ReviewsPage = ({ showBusiness = false }: ReviewsPageProps) => {
  const { t } = useTranslation();
  const reviewService = useMemo(() => new ReviewService(), []);
  const profileService = useMemo(() => new ProfileService(), []);
  const { profile, setProfile } = useUserStore();

  const [reviews, setReviews] = useState<ReviewData[]>([]);
  const [avgRating, setAvgRating] = useState(0);
  const [reviewCount, setReviewCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [ratingFilter, setRatingFilter] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState(DEFAULT_PAGE);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    if (profile) return;
    const fetchProfile = async () => {
      try {
        setLoadingProfile(true);
        const fetched = await profileService.getProfile();
        setProfile(fetched);
      } catch {
        setError(t('failedToLoadBusinessId') || 'Failed to load profile');
      } finally {
        setLoadingProfile(false);
      }
    };
    fetchProfile();
  }, [profile, profileService, setProfile, t]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setCurrentPage(DEFAULT_PAGE);
    }, DEFAULT_DEBOUNCE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const fetchReviews = useCallback(async () => {
    if (loadingProfile) return;
    setLoading(true);
    setError('');
    try {
      const offset = (currentPage - 1) * PAGE_LIMIT;
      const data = await reviewService.getMyReviews(PAGE_LIMIT, offset);
      setReviews(data.reviews);
      setAvgRating(data.avg_rating);
      setReviewCount(data.review_count);
      setTotalPages(Math.max(1, Math.ceil(data.review_count / PAGE_LIMIT)));
    } catch (err: any) {
      const msg =
        err?.response?.data?.detail?.message ||
        err?.message ||
        t('failedToLoadData') ||
        'Failed to load reviews';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [loadingProfile, currentPage, reviewService, t]);

  useEffect(() => {
    fetchReviews();
  }, [fetchReviews]);

  const filtered = useMemo(() => {
    let list = reviews;
    if (ratingFilter > 0) {
      list = list.filter((r) => Math.round(r.rating) === ratingFilter);
    }
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      list = list.filter(
        (r) =>
          r.user_name?.toLowerCase().includes(q) ||
          r.comment?.toLowerCase().includes(q) ||
          (showBusiness && r.business_name?.toLowerCase().includes(q))
      );
    }
    return list;
  }, [reviews, ratingFilter, debouncedSearch, showBusiness]);

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return '';
    try {
      return new Date(dateStr).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="reviews-page">
      {/* Summary */}
      <div className="content-card rv-summary">
        <div className="rv-summary-inner">
          <span className="rv-summary-num">{avgRating.toFixed(1)}</span>
          <StarDisplay rating={avgRating} />
          <span className="rv-summary-label">
            {reviewCount} {reviewCount === 1 ? 'review' : 'reviews'}
          </span>
        </div>
      </div>

      {/* List */}
      <div className="content-card">
        <div className="card-header">
          <h2 className="card-title">
            {showBusiness ? 'All Reviews' : 'My Reviews'}
          </h2>
          <PageToolbar
            filters={
              <>
                <input
                  type="text"
                  className="filter-input"
                  placeholder={showBusiness ? 'Search by name, comment, or business…' : 'Search by name or comment…'}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  disabled={loading}
                />
                <select
                  className="filter-select"
                  value={ratingFilter}
                  onChange={(e) => {
                    setRatingFilter(Number(e.target.value));
                    setCurrentPage(DEFAULT_PAGE);
                  }}
                  disabled={loading}
                >
                  <option value={0}>All ratings</option>
                  {[5, 4, 3, 2, 1].map((n) => (
                    <option key={n} value={n}>{n} Star{n > 1 ? 's' : ''}</option>
                  ))}
                </select>
              </>
            }
          />
        </div>

        {error && (
          <div className="rv-error">
            <span>{error}</span>
            <button className="rv-retry-btn" onClick={fetchReviews}>Retry</button>
          </div>
        )}

        {loading ? (
          <div className="rv-list">
            {[0, 1, 2].map((i) => (
              <div key={i} className="rv-card rv-card--skeleton">
                <div className="rv-card-header">
                  <div className="rv-user">
                    <div className="rv-avatar rv-sk" />
                    <div className="rv-user-info">
                      <div className="rv-sk rv-sk--name" />
                      <div className="rv-sk rv-sk--date" />
                    </div>
                  </div>
                  <div className="rv-sk rv-sk--stars" />
                </div>
                <div className="rv-sk rv-sk--comment" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">⭐</div>
            <div className="empty-state-title">No reviews yet</div>
            <div className="empty-state-sub">
              {debouncedSearch || ratingFilter > 0
                ? 'No reviews match your filter.'
                : 'Customer reviews will appear here after appointments.'}
            </div>
          </div>
        ) : (
          <div className="rv-list">
            {filtered.map((review) => (
              <div key={review.uuid} className="rv-card">
                <div className="rv-card-header">
                  <div className="rv-user">
                    <div className="rv-avatar">
                      {getInitials(review.user_name)}
                    </div>
                    <div className="rv-user-info">
                      <span className="rv-user-name">
                        {review.user_name || 'Anonymous'}
                      </span>
                      {showBusiness && review.business_name && (
                        <span className="rv-business-tag">
                          {review.business_name}
                        </span>
                      )}
                      <span className="rv-date">{formatDate(review.created_at)}</span>
                    </div>
                  </div>
                  <div className="rv-rating-wrap">
                    <StarDisplay rating={review.rating} />
                    <span className="rv-rating-num">{review.rating.toFixed(1)}</span>
                  </div>
                </div>
                {review.comment && (
                  <p className="rv-comment">{review.comment}</p>
                )}
              </div>
            ))}
          </div>
        )}

        {!loading && !error && totalPages > 1 && (
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
            disabled={loading}
          />
        )}
      </div>
    </div>
  );
};

export default ReviewsPage;
