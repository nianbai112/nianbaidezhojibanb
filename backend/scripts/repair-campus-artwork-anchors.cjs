const path = require('node:path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { PrismaClient } = require('@prisma/client');

const MAP_HEIGHT = 2990.41;
const TOP_LEFT_ANCHORS = [
  [1, 302.44, 1715.91], [2, 233.14, 1933.59], [3, 535.15, 1648.29],
  [4, 672.78, 1858.49], [5, 720.94, 1655.22], [6, 890.06, 1733.56],
  [7, 742.48, 2130.70], [8, 655.81, 2242.13], [9, 832.20, 1364.73],
  [10, 1061.05, 1372.11], [11, 934.26, 1507.70], [12, 1196.67, 1447.56],
  [13, 1116.64, 1603.29], [14, 971.98, 2370.60], [15, 1150.91, 1948.63],
  [16, 1658.55, 2021.58], [17, 1706.55, 2138.70], [18, 1375.77, 1448.04],
  [19, 1144.27, 1017.71], [20, 1389.63, 1171.86], [21, 1416.85, 1687.17],
  [22, 2063.94, 1444.38], [23, 1226.54, 695.50], [24, 1532.91, 854.83],
  [25, 1433.48, 780.17], [26, 1335.45, 549.79], [27, 1602.70, 530.79],
  [28, 1459.99, 348.84], [29, 1955.93, 737.25], [30, 1859.70, 1084.44],
  [31, 2256.82, 1018.03], [32, 1742.73, 454.41], [33, 1980.33, 617.82],
  [34, 1677.75, 212.79], [35, 2068.77, 435.85], [36, 2330.11, 691.65],
  [37, 1304.99, 49.90], [38, 1235.49, 395.45],
];

const OFFICIAL_NAMES = new Map([
  [1, '第三校门'], [2, '停车场'], [3, '天枢楼'], [4, '天启楼'], [5, '天工楼'], [6, '天霁楼'],
  [7, '人和楼'], [8, '人仁楼'], [9, '龙韬楼'], [10, '龙衍楼'], [11, '龙翰楼'], [12, '龙煜楼'],
  [13, '龙渊楼'], [14, '地润书院'], [15, '学生餐厅'], [16, '贤怡苑'], [17, '贤朗苑'],
  [18, '第二校门'], [19, '和沐书院'], [20, '运动场'], [21, '校园景云街'], [22, '第一校门'],
  [23, '教学楼A'], [24, '科研楼'], [25, '教学楼B'], [26, '学生公寓A'], [27, '学生公寓B'],
  [28, '学生公寓C'], [29, '图书馆'], [30, '体育馆'], [31, '学生公寓E'], [32, '学生餐厅A'],
  [33, '学生餐厅B'], [34, '学生公寓D'], [35, '校史馆'], [36, '学生公寓F'],
  [37, '教师公寓'], [38, '北大门'],
]);

async function main() {
  const regionId = String(process.argv[2] || '').trim();
  if (!regionId) throw new Error('Usage: node scripts/repair-campus-artwork-anchors.cjs <regionId>');
  const prisma = new PrismaClient();
  try {
    const projects = await prisma.campusMapProject.findMany({
      where: { regionId, officialNumber: { in: TOP_LEFT_ANCHORS.map(([number]) => number) } },
      select: { id: true, officialNumber: true, artworkFeatureKey: true },
    });
    const byNumber = new Map(projects.map((project) => [Number(project.officialNumber), project]));
    let updated = 0;
    for (const [officialNumber, x, yFromTop] of TOP_LEFT_ANCHORS) {
      const project = byNumber.get(officialNumber);
      if (!project) continue;
      const y = Number((MAP_HEIGHT - yFromTop).toFixed(2));
      await prisma.campusMapProject.update({
        where: { id: project.id },
        data: {
          officialName: OFFICIAL_NAMES.get(officialNumber),
          artworkFeatureKey: project.artworkFeatureKey || `illustrated-place-${officialNumber}`,
          artworkAnchorX: x,
          artworkAnchorY: y,
          artworkGeometry: { type: 'Point', coordinates: [x, y] },
          geometryStatus: 'verified_point',
          sourceConfidence: 'official_signage_and_cad',
        },
      });
      updated += 1;
    }
    console.log(JSON.stringify({ regionId, found: projects.length, updated }));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exitCode = 1;
});
