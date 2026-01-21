# Pagination Component

A reusable pagination component for displaying page navigation controls.

## Usage

```tsx
import Pagination from '../../components/pagination';

function MyComponent() {
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(10);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    // Fetch data for the new page
  };

  return (
    <Pagination
      currentPage={currentPage}
      totalPages={totalPages}
      onPageChange={handlePageChange}
    />
  );
}
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `currentPage` | `number` | **required** | The current active page number |
| `totalPages` | `number` | **required** | Total number of pages |
| `onPageChange` | `(page: number) => void` | **required** | Callback function called when page changes |
| `maxVisible` | `number` | `5` | Maximum number of page buttons to show (excluding ellipsis) |
| `showFirstLast` | `boolean` | `false` | Show first/last page buttons («« and »») |
| `className` | `string` | `''` | Additional CSS class names |
| `disabled` | `boolean` | `false` | Disable all pagination controls |

## Features

- **Smart page number display**: Automatically shows ellipsis (...) when there are many pages
- **Accessibility**: Includes ARIA labels and proper semantic HTML
- **Internationalization**: Uses translation keys from `useLayoutContext`
- **Responsive**: Works well on different screen sizes
- **Customizable**: Supports custom styling via className prop

## Examples

### Basic Usage
```tsx
<Pagination
  currentPage={1}
  totalPages={10}
  onPageChange={(page) => console.log(page)}
/>
```

### With First/Last Buttons
```tsx
<Pagination
  currentPage={5}
  totalPages={20}
  onPageChange={handlePageChange}
  showFirstLast={true}
/>
```

### Custom Max Visible Pages
```tsx
<Pagination
  currentPage={10}
  totalPages={50}
  onPageChange={handlePageChange}
  maxVisible={7}
/>
```

### Disabled State
```tsx
<Pagination
  currentPage={1}
  totalPages={10}
  onPageChange={handlePageChange}
  disabled={loading}
/>
```

## Translation Keys

The component uses the following translation keys (with fallbacks):
- `previousPage`: "Previous page"
- `nextPage`: "Next page"
- `firstPage`: "First page"
- `lastPage`: "Last page"
- `goToPage`: "Go to page {page}"
