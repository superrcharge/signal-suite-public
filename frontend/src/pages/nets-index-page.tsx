import { MainLayout } from '@/components/layouts/main-layout';
import { PageBanner, PageTitle, PageSubtitle, RAIL_TITLE_ML } from '@/components/common';
import { SectionPicker } from '@/components/pace/SectionPicker';

/**
 * Landing page for the Nets Library: pick whose library to open.
 *
 * Nets are per-squadron, so there is no combined list to land on -- one
 * squadron editing FIRES must not change another's.
 */
export function NetsIndexPage() {
  return (
    <MainLayout>
      <PageBanner sx={{ mb: 3 }}>
        <PageTitle sx={{ minWidth: 0, ml: RAIL_TITLE_ML }}>
          Nets Library
          <PageSubtitle>Each squadron keeps its own nets. A net name is commonly shared, FIRES, CMD, ASLT, while the frequencies behind it are not.</PageSubtitle>
        </PageTitle>
      </PageBanner>

      <SectionPicker hrefFor={(key) => `/nets/${key}`} />
    </MainLayout>
  );
}
