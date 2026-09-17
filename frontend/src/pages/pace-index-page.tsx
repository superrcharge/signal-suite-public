import { MainLayout } from '@/components/layouts/main-layout';
import { PageBanner, PageTitle, PageSubtitle, RAIL_TITLE_ML } from '@/components/common';
import { SectionPicker } from '@/components/pace/SectionPicker';

/** Landing page for the PACE Planner: pick the squadron whose card to open. */
export function PaceIndexPage() {
  return (
    <MainLayout>
      <PageBanner sx={{ mb: 3 }}>
        <PageTitle sx={{ minWidth: 0, ml: RAIL_TITLE_ML }}>
          JEM / MPU5 Wheels
          <PageSubtitle>Each squadron has its own channel wheels and PACE plan. Pick one to open its card.</PageSubtitle>
        </PageTitle>
      </PageBanner>

      <SectionPicker hrefFor={(key) => `/pace/${key}`} />
    </MainLayout>
  );
}
