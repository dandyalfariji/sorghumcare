import React, { useState } from 'react';
import { useData } from '../../lib/dataContext';

interface CardImageWithSkeletonProps {
  src?: string;
  alt: string;
  fallbackSrc: string;
  containerClassName?: string;
  imageClassName?: string;
  /**
   * Native lazy-loading untuk gambar. Default `lazy` karena hampir semua
   * pemakaian komponen ini ada di dalam grid/carousel katalog yang berada di
   * bawah lipatan — dulu SEMUA gambar (37+ URL Unsplash berukuran w=800)
   * diunduh di awal halaman, memboroskan kuota pengguna mobile.
   * Set `eager` hanya untuk gambar hero/utama yang terlihat tanpa scroll.
   */
  loading?: 'lazy' | 'eager';
  /** Hint prioritas fetch; pasangkan `high` hanya dengan `loading="eager"`. */
  fetchPriority?: 'high' | 'low' | 'auto';
}

/**
 * An image component that displays an animated placeholder matching the exact
 * container dimensions until the image finishes loading.
 */
export const CardImageWithSkeleton: React.FC<CardImageWithSkeletonProps> = ({
  src,
  alt,
  fallbackSrc,
  containerClassName = 'relative w-full h-full overflow-hidden bg-[#e8eae6]',
  imageClassName = 'w-full h-full object-cover',
  loading = 'lazy',
  fetchPriority = 'auto',
}) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  // Toggle admin global: saat gambar dimatikan, jangan render apa pun
  // agar kartu tidak menyisakan kotak putih/blank.
  const { imagesEnabled } = useData();
  if (!imagesEnabled) return null;

  return (
    <div className={containerClassName}>
      {/* Animated Shimmer Placeholder matching exact size */}
      {!isLoaded && (
        <div 
          className="absolute inset-0 animate-shimmer bg-[#e8eae6] z-10 flex items-center justify-center pointer-events-none"
          aria-hidden="true"
        >
          <div className="w-8 h-8 rounded-full bg-white/25 flex items-center justify-center text-white/40 animate-pulse text-xs">
            🌾
          </div>
        </div>
      )}

      {/* Actual Image with smooth fade-in */}
      <img
        data-food
        src={hasError ? fallbackSrc : src || fallbackSrc}
        alt={alt}
        referrerPolicy="no-referrer"
        loading={loading}
        fetchPriority={fetchPriority}
        onLoad={() => setIsLoaded(true)}
        onError={() => {
          setHasError(true);
          setIsLoaded(true);
        }}
        className={`${imageClassName} transition-opacity duration-300 ${
          isLoaded ? 'opacity-100' : 'opacity-0'
        }`}
      />
    </div>
  );
};

/**
 * Placeholder Skeleton for Top Carousel Cards in Explore
 */
export const CarouselCardSkeleton: React.FC<{ width?: number | string }> = ({ width = 320 }) => {
  return (
    <div
      style={{ width: typeof width === 'number' ? `${width}px` : width }}
      className="shrink-0 bg-white rounded-3xl overflow-hidden border border-[#c2c8c0]/60 shadow-xs flex flex-col justify-between"
    >
      {/* Image Media Placeholder (h-40) */}
      <div>
        <div className="relative h-40 w-full animate-shimmer bg-[#e8eae6]">
          {/* Top badge placeholders */}
          <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between">
            <div className="w-16 h-5 rounded-full bg-white/40 animate-pulse" />
            <div className="w-12 h-6 rounded-full bg-white/40 animate-pulse" />
          </div>
          {/* Bottom tag placeholder */}
          <div className="absolute bottom-2.5 left-2.5 flex items-center gap-1.5">
            <div className="w-14 h-4 rounded-md bg-white/35 animate-pulse" />
          </div>
        </div>

        {/* Card Body */}
        <div className="p-3.5 space-y-3">
          {/* Title and subtitle */}
          <div className="space-y-1.5">
            <div className="h-4 bg-[#e8eae6] rounded-md w-3/4 animate-shimmer" />
            <div className="h-3 bg-[#e8eae6] rounded-md w-1/2 animate-shimmer" />
          </div>

          {/* Tag pills */}
          <div className="flex items-center gap-1.5">
            <div className="h-4 w-16 bg-[#e8eae6] rounded-full animate-shimmer" />
            <div className="h-4 w-12 bg-[#e8eae6] rounded-full animate-shimmer" />
          </div>
        </div>
      </div>

      {/* Card Footer Button */}
      <div className="p-3.5 pt-0">
        <div className="h-9 w-full rounded-xl bg-[#e8eae6] animate-shimmer" />
      </div>
    </div>
  );
};

/**
 * Placeholder Skeleton for 2-column Explore Recipe Grid Cards
 */
export const GridRecipeCardSkeleton: React.FC = () => {
  return (
    <div className="bg-white rounded-2xl sm:rounded-3xl overflow-hidden border border-[#c2c8c0]/50 shadow-xs flex flex-col justify-between">
      {/* Image Media Placeholder (h-32 xs:h-36 sm:h-48 md:h-52) */}
      <div>
        <div className="relative h-32 xs:h-36 sm:h-48 md:h-52 w-full animate-shimmer bg-[#e8eae6]">
          {/* Top badges */}
          <div className="absolute top-2 sm:top-3 left-2 sm:left-3 right-2 sm:right-3 flex items-center justify-between">
            <div className="w-14 sm:w-20 h-4 sm:h-5 rounded-full bg-white/40 animate-pulse" />
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-white/40 animate-pulse" />
          </div>
          {/* Bottom overlay tags */}
          <div className="absolute bottom-2 sm:bottom-2.5 left-2 sm:left-3 right-2 sm:right-3 flex items-center justify-between">
            <div className="w-12 sm:w-16 h-4 sm:h-5 rounded-md bg-white/35 animate-pulse" />
            <div className="w-14 sm:w-18 h-4 sm:h-5 rounded-md bg-white/35 animate-pulse" />
          </div>
        </div>

        {/* Card Body */}
        <div className="p-2.5 sm:p-4 space-y-2 sm:space-y-3">
          {/* Title & subtitle lines */}
          <div className="space-y-1.5">
            <div className="h-3.5 sm:h-4 bg-[#e8eae6] rounded-md w-4/5 animate-shimmer" />
            <div className="h-2.5 sm:h-3 bg-[#e8eae6] rounded-md w-full animate-shimmer" />
            <div className="h-2.5 sm:h-3 bg-[#e8eae6] rounded-md w-2/3 animate-shimmer" />
          </div>

          {/* Nutrition / Highlights tag */}
          <div className="h-5 sm:h-6 bg-[#e8eae6] rounded-lg w-3/4 animate-shimmer" />
        </div>
      </div>

      {/* Button footer */}
      <div className="p-2.5 sm:p-4 pt-0">
        <div className="h-8 sm:h-9 bg-[#e8eae6] rounded-lg sm:rounded-xl w-full animate-shimmer" />
      </div>
    </div>
  );
};

/**
 * Placeholder Skeleton for Horizontal Favorite Cards in Home
 */
export const FavoriteCardSkeleton: React.FC = () => {
  return (
    <div className="min-w-[270px] sm:min-w-[290px] bg-white rounded-2xl border border-[#c2c8c0]/60 overflow-hidden flex flex-col shrink-0 shadow-xs">
      {/* Media (h-36) */}
      <div className="h-36 bg-[#e8eae6] relative overflow-hidden animate-shimmer">
        <div className="absolute top-2.5 right-2.5 w-7 h-7 rounded-full bg-white/50 animate-pulse" />
      </div>

      {/* Body */}
      <div className="p-3.5 flex-grow flex flex-col justify-between space-y-3">
        <div>
          <div className="flex gap-1.5 mb-2">
            <div className="h-4 w-16 rounded-full bg-[#e8eae6] animate-shimmer" />
            <div className="h-4 w-12 rounded-full bg-[#e8eae6] animate-shimmer" />
          </div>
          <div className="space-y-1">
            <div className="h-4 w-4/5 rounded-md bg-[#e8eae6] animate-shimmer" />
            <div className="h-3.5 w-3/5 rounded-md bg-[#e8eae6] animate-shimmer" />
          </div>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-[#f4f4f2]">
          <div className="h-3.5 w-20 rounded bg-[#e8eae6] animate-shimmer" />
          <div className="h-3.5 w-16 rounded bg-[#e8eae6] animate-shimmer" />
        </div>
      </div>
    </div>
  );
};

/**
 * Placeholder Skeleton for Category Cards (Aspect Square)
 */
export const CategoryCardSkeleton: React.FC = () => {
  return (
    <div className="aspect-square rounded-2xl overflow-hidden relative shrink-0 shadow-xs bg-[#e8eae6] animate-shimmer flex flex-col items-center justify-center p-3">
      <div className="w-16 h-4 rounded bg-white/40 mb-1.5 animate-pulse" />
      <div className="w-20 h-3 rounded bg-white/30 animate-pulse" />
    </div>
  );
};

/**
 * Placeholder Skeleton for Video Tutorial Cards (h-40)
 */
export const VideoTutorialCardSkeleton: React.FC = () => {
  return (
    <div className="bg-white rounded-2xl border border-[#c2c8c0]/60 overflow-hidden shadow-xs">
      <div className="relative h-40 bg-[#e8eae6] animate-shimmer flex items-center justify-center">
        <div className="w-12 h-12 rounded-full bg-white/40 animate-pulse" />
        <div className="absolute bottom-2 right-2 w-10 h-4 rounded bg-white/50 animate-pulse" />
      </div>
      <div className="p-3.5 space-y-1.5">
        <div className="h-4 w-4/5 rounded bg-[#e8eae6] animate-shimmer" />
        <div className="h-3 w-1/2 rounded bg-[#e8eae6] animate-shimmer" />
      </div>
    </div>
  );
};

/**
 * Placeholder Skeleton for Home Quick AI Generator Hero Banner
 */
export const HomeBannerSkeleton: React.FC = () => {
  return (
    <div className="bg-gradient-to-r from-[#163422]/90 to-[#2d4b37]/90 rounded-3xl p-5 sm:p-6 shadow-md relative overflow-hidden flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
      <div className="space-y-2.5 z-10 w-full max-w-lg">
        <div className="flex items-center gap-2">
          <div className="h-5 w-24 bg-white/25 rounded-full animate-shimmer" />
          <div className="h-4 w-36 bg-white/15 rounded-full animate-shimmer" />
        </div>
        <div className="h-7 bg-white/25 rounded-lg w-4/5 animate-shimmer" />
        <div className="h-4 bg-white/20 rounded-md w-full animate-shimmer" />
      </div>
      <div className="h-12 w-48 bg-white/25 rounded-2xl animate-shimmer flex-shrink-0" />
    </div>
  );
};

/**
 * Placeholder Skeleton for an Individual Home Carousel Card (185px / 200px)
 */
export const HomeCarouselCardSkeleton: React.FC<{ withImage?: boolean }> = ({
  withImage = true,
}) => {
  return (
    <div className="w-[185px] sm:w-[200px] bg-white rounded-2xl border border-[#c2c8c0]/60 overflow-hidden shrink-0 shadow-xs flex flex-col justify-between">
      {/* Thumbnail area (h-28) */}
      {withImage && (
      <div className="relative h-28 bg-[#e8eae6] animate-shimmer">
        <div className="absolute bottom-1.5 right-1.5 w-10 h-3.5 bg-black/30 rounded" />
      </div>
      )}

      {/* Content */}
      <div className="p-2.5 space-y-2 flex-grow flex flex-col justify-between">
        <div className="space-y-1.5">
          <div className="h-3.5 bg-[#e8eae6] rounded w-4/5 animate-shimmer" />
          <div className="h-2.5 bg-[#e8eae6] rounded w-3/5 animate-shimmer" />
        </div>

        <div className="pt-2 border-t border-[#f4f4f2] flex items-center justify-between">
          <div className="h-3 w-16 bg-[#e8eae6] rounded animate-shimmer" />
          <div className="h-3.5 w-12 bg-[#e8eae6] rounded-md animate-shimmer" />
        </div>
      </div>
    </div>
  );
};

/**
 * Placeholder Skeleton for Entire Home Carousel Section (Header + Scroll Row)
 */
export const HomeCarouselSectionSkeleton: React.FC<{
  titleWidth?: string;
  subtitleWidth?: string;
  cardCount?: number;
  withImage?: boolean;
}> = ({
  titleWidth = 'w-44',
  subtitleWidth = 'w-60',
  cardCount = 5,
  withImage = true,
}) => {
  return (
    <section className="space-y-3">
      {/* Section Header Skeleton */}
      <div className="flex items-center justify-between">
        <div className="space-y-1.5">
          <div className={`h-5 bg-[#e8eae6] rounded-md ${titleWidth} animate-shimmer`} />
          <div className={`h-3 bg-[#e8eae6] rounded-md ${subtitleWidth} animate-shimmer`} />
        </div>
        {/* Skeleton Arrow Controls */}
        <div className="flex items-center gap-1.5">
          <div className="w-8 h-8 rounded-full bg-[#e8eae6] animate-shimmer" />
          <div className="w-8 h-8 rounded-full bg-[#e8eae6] animate-shimmer" />
        </div>
      </div>

      {/* Horizontal Carousel Row Skeleton */}
      <div className="flex overflow-x-hidden gap-3 pb-2 -mx-4 px-4 md:mx-0 md:px-0">
        {Array.from({ length: cardCount }).map((_, idx) => (
          <HomeCarouselCardSkeleton key={idx} withImage={withImage} />
        ))}
      </div>
    </section>
  );
};

/**
 * Full Page Placeholder Skeleton for Recipe Detail
 */
export const RecipeDetailSkeleton: React.FC = () => {
  return (
    <div className="space-y-6 animate-pulse-subtle">
      {/* Hero Media Placeholder */}
      <div className="relative w-full h-64 md:h-96 rounded-2xl bg-[#e8eae6] animate-shimmer overflow-hidden">
        <div className="absolute bottom-4 left-4 flex gap-2">
          <div className="w-20 h-6 rounded-full bg-white/40 animate-shimmer" />
          <div className="w-24 h-6 rounded-full bg-white/40 animate-shimmer" />
        </div>
      </div>

      {/* Title & Metadata */}
      <div className="space-y-3">
        <div className="h-8 bg-[#e8eae6] rounded-lg w-2/3 animate-shimmer" />
        <div className="h-4 bg-[#e8eae6] rounded-md w-4/5 animate-shimmer" />
        <div className="flex gap-3 pt-2">
          <div className="h-8 w-24 bg-[#e8eae6] rounded-xl animate-shimmer" />
          <div className="h-8 w-28 bg-[#e8eae6] rounded-xl animate-shimmer" />
          <div className="h-8 w-20 bg-[#e8eae6] rounded-xl animate-shimmer" />
        </div>
      </div>

      {/* Nutrition Macro Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="p-3 bg-white rounded-2xl border border-[#c2c8c0]/50 space-y-2">
            <div className="h-3 w-14 bg-[#e8eae6] rounded animate-shimmer" />
            <div className="h-6 w-16 bg-[#e8eae6] rounded-md animate-shimmer" />
          </div>
        ))}
      </div>

      {/* Ingredients & Steps Shimmer */}
      <div className="space-y-4 pt-2">
        <div className="h-5 w-36 bg-[#e8eae6] rounded-md animate-shimmer" />
        <div className="space-y-2.5">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-12 bg-white rounded-xl border border-[#c2c8c0]/40 p-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-6 h-6 rounded-full bg-[#e8eae6] animate-shimmer" />
                <div className="h-4 w-40 bg-[#e8eae6] rounded animate-shimmer" />
              </div>
              <div className="h-3.5 w-16 bg-[#e8eae6] rounded animate-shimmer" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

/**
 * Placeholder Skeleton for Search Modal Results
 */
export const SearchModalSkeleton: React.FC = () => {
  return (
    <div className="space-y-2.5 py-1">
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="p-2.5 rounded-2xl bg-[#f9f9f7] border border-[#e2e3e1]/60 flex items-center gap-3"
        >
          <div className="w-14 h-14 rounded-xl bg-[#e8eae6] animate-shimmer shrink-0" />
          <div className="flex-1 space-y-1.5">
            <div className="h-4 bg-[#e8eae6] rounded w-3/4 animate-shimmer" />
            <div className="h-3 bg-[#e8eae6] rounded w-1/2 animate-shimmer" />
          </div>
          <div className="h-4 w-12 bg-[#e8eae6] rounded-md animate-shimmer shrink-0" />
        </div>
      ))}
    </div>
  );
};

/**
 * Placeholder Skeleton for Profile Page
 */
export const ProfilePageSkeleton: React.FC = () => {
  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Avatar & Header */}
      <div className="flex flex-col items-center space-y-3">
        <div className="w-24 h-24 rounded-full bg-[#e8eae6] animate-shimmer" />
        <div className="h-6 w-40 bg-[#e8eae6] rounded-md animate-shimmer" />
        <div className="h-4 w-60 bg-[#e8eae6] rounded-md animate-shimmer" />
      </div>

      {/* 3 Stats Cards */}
      <div className="grid grid-cols-3 gap-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="p-4 bg-white rounded-2xl border border-[#c2c8c0]/50 flex flex-col items-center space-y-2">
            <div className="h-6 w-12 bg-[#e8eae6] rounded-md animate-shimmer" />
            <div className="h-3 w-16 bg-[#e8eae6] rounded animate-shimmer" />
          </div>
        ))}
      </div>

      {/* Saved Section Grid */}
      <div className="space-y-3">
        <div className="h-5 w-32 bg-[#e8eae6] rounded animate-shimmer" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-28 bg-white rounded-2xl border border-[#c2c8c0]/50 p-3 flex gap-3">
              <div className="w-24 h-full bg-[#e8eae6] rounded-xl animate-shimmer" />
              <div className="flex-1 space-y-2 py-1">
                <div className="h-4 w-3/4 bg-[#e8eae6] rounded animate-shimmer" />
                <div className="h-3 w-1/2 bg-[#e8eae6] rounded animate-shimmer" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

/**
 * Placeholder Skeleton for Chat / AI Recipe Generation
 */
export const ChatRecipeCardSkeleton: React.FC<{ statusText?: string }> = ({
  statusText = 'AI Chef sedang meracik resep bernutrisi sorgum...',
}) => {
  const { imagesEnabled } = useData();
  return (
    <div className="max-w-[95%] md:max-w-[90%] bg-white rounded-3xl p-4 sm:p-5 border border-[#163422]/20 shadow-lg space-y-4 font-['Manrope',sans-serif]">
      {/* Pulsing Status Header */}
      <div className="flex items-center gap-2 text-[#163422] pb-1 border-b border-[#f4f4f2]">
        <div className="w-2.5 h-2.5 rounded-full bg-[#fdc65c] animate-ping" />
        <span className="text-xs sm:text-sm font-bold text-[#163422] animate-pulse">
          {statusText}
        </span>
      </div>

      {/* Shimmer Hero */}
      {imagesEnabled && (
      <div className="relative h-44 sm:h-52 w-full rounded-2xl bg-[#e8eae6] animate-shimmer flex items-center justify-center">
        <div className="text-2xl animate-bounce">🌾</div>
      </div>
      )}

      {/* Title lines */}
      <div className="space-y-2">
        <div className="h-5 bg-[#e8eae6] rounded-md w-3/4 animate-shimmer" />
        <div className="h-3.5 bg-[#e8eae6] rounded-md w-1/2 animate-shimmer" />
      </div>

      {/* Ingredient & nutrition chips */}
      <div className="flex gap-2">
        <div className="h-6 w-20 rounded-full bg-[#e8eae6] animate-shimmer" />
        <div className="h-6 w-24 rounded-full bg-[#e8eae6] animate-shimmer" />
        <div className="h-6 w-16 rounded-full bg-[#e8eae6] animate-shimmer" />
      </div>

      {/* Simulated steps shimmer */}
      <div className="space-y-2 pt-2 border-t border-[#f4f4f2]">
        <div className="h-3 bg-[#e8eae6] rounded w-full animate-shimmer" />
        <div className="h-3 bg-[#e8eae6] rounded w-5/6 animate-shimmer" />
      </div>
    </div>
  );
};
