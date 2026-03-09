/**
 * Builds a list of page labels for pagination controls.
 * - Always includes first and last pages.
 * - Shows up to `maxLinks` numeric links total; uses "..." when ranges are skipped.
 *
 * @param {number} currentPage - The page the user is on (1-indexed).
 * @param {number} totalPages - The total number of pages available.
 * @param {number} [maxLinks=5] - Maximum numeric links to show, counting first and last pages.
 * @returns {(number|string)[]} An ordered Array of page numbers and "..." strings
 */
export const getPagination = (currentPage, totalPages, maxLinks = 5) => {
  // If total pages are less than or equal to maxLinks, return all pages.
  if (totalPages <= maxLinks) {
    // return an array with length totalPages and map index of array to element with value index+1 . Element at index 0 has the value i+1=0+1=1 => array will be at the end [1,2,3,4,5]
    // totalPages= 4 => [1,2,3,4]

    //!note: this is a way to create an array of numbers from 1 to totalPages
    // return Array.from({ length: totalPages }, (_, x) => x + 1);

    /*   return [...Array(totalPages).keys()].map((x) => x + 1);
     */

    // return [...Array(totalPages).keys()].map((x) => x + 1);
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const pages = [];

  // Calculate the size of the middle window.
  const windowSize = maxLinks - 2; // excluding first and last pages

  const halfWindow = Math.floor(windowSize / 2);
  let start = currentPage - halfWindow;
  let end = currentPage + halfWindow;

  // Adjust the window if it goes out of bounds.
  if (start < 2) {
    end += 2 - start;
    start = 2;
  }
  if (end > totalPages - 1) {
    start -= end - (totalPages - 1);
    end = totalPages - 1;
    if (start < 2) start = 2;
  }

  // push the first page
  pages.push(1);

  // Add ellipsis if there's a gap between first page and start.
  if (start > 2) {
    pages.push("...");
  }

  // Add the sliding window pages.
  for (let i = start; i <= end; i++) {
    pages.push(i);
  }

  // Add ellipsis if there's a gap between the window and the last page.
  if (end < totalPages - 1) {
    pages.push("...");
  }

  pages.push(totalPages); // Always include the last page.

  return pages;
};
