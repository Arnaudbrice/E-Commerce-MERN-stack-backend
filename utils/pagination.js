/**
 * Builds a list of page labels for pagination controls.
 * - Always includes first and last pages.
 * - Shows up to `maxLinks` numeric links total; uses "..." when ranges are skipped.
 *
 * @param {number} currentPage - The page the user is on (1-indexed).
 * @param {number} lastPage - The total number of pages available.
 * @param {number} [maxLinks=5] - Maximum numeric links to show, counting first and last pages.
 * @returns {(number|string)[]} An ordered array of page labels (numbers or "...") for rendering pagination.
 */
export const getPagination = (currentPage, lastPage, maxLinks = 5) => {
  // If total pages are less than or equal to maxLinks, return all pages.
  if (lastPage <= maxLinks) {
    // return an array with length lastPage and map index of array to element with value index+1 . Element at index 0 has the value i+1=0+1=1 => array will be at the end [1,2,3,4,5]
    // lastPage= 4 => [1,2,3,4]

    //!note: this is a way to create an array of numbers from 1 to lastPage
    // return Array.from({ length: lastPage }, (_, x) => x + 1);

    /*   return [...Array(lastPage).keys()].map((x) => x + 1);
     */

    return [...Array(lastPage).keys()].map((x) => x + 1);
  }

  const pages = [];
  pages.push(1); // Always include the first page.

  // Calculate the size of the middle window.
  const windowSize = maxLinks - 2; // excluding first and last pages
  let start = currentPage - Math.floor(windowSize / 2);
  let end = currentPage + Math.floor(windowSize / 2);

  // Adjust the window if it goes out of bounds.
  if (start < 2) {
    end += 2 - start;
    start = 2;
  }
  if (end > lastPage - 1) {
    start -= end - (lastPage - 1);
    end = lastPage - 1;
    if (start < 2) start = 2;
  }

  // Add ellipsis if there's a gap between first page and start.
  if (start > 2) {
    pages.push("...");
  }

  // Add the sliding window pages.
  for (let i = start; i <= end; i++) {
    pages.push(i);
  }

  // Add ellipsis if there's a gap between the window and the last page.
  if (end < lastPage - 1) {
    pages.push("...");
  }

  pages.push(lastPage); // Always include the last page.

  return pages;
};
