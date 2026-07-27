<template>
  <div class="page-container">
    <PageHeader title="圈子运营" subtitle="圈子审核、圈主绑定、成员治理、圈内内容和风险处理统一工作台" icon="Connection">
      <template #actions>
        <el-button @click="loadAll" :loading="loading || overviewLoading">刷新</el-button>
        <el-button v-if="hasEditPermission" type="primary" @click="openCreate">创建圈子</el-button>
      </template>
    </PageHeader>

    <StatGrid :items="statItems" />

    <el-tabs v-model="activeTab" class="circle-tabs" @tab-change="handleTabChange">
      <el-tab-pane label="运营总览" name="overview">
        <div class="overview-grid">
          <section class="glass-card panel">
            <div class="panel-title">热门圈子</div>
            <el-table :data="overview.hotCircles || []" size="small" border>
              <el-table-column label="圈子" min-width="180">
                <template #default="{ row }">
                  <CircleNameCell :row="row" />
                </template>
              </el-table-column>
              <el-table-column label="圈主" width="150">
                <template #default="{ row }">{{ row.owner?.nickname || '未绑定' }}</template>
              </el-table-column>
              <el-table-column label="成员/帖子" width="110">
                <template #default="{ row }">{{ row.memberCount || 0 }} / {{ row.postCount || 0 }}</template>
              </el-table-column>
              <el-table-column label="操作" width="120">
                <template #default="{ row }">
                  <el-button size="small" link type="primary" @click="openContent(row)">看内容</el-button>
                  <el-button v-if="hasEditPermission" size="small" link @click="viewMembers(row)">成员</el-button>
                </template>
              </el-table-column>
            </el-table>
          </section>

          <section class="glass-card panel">
            <div class="panel-title">需要关注</div>
            <el-table :data="overview.riskyCircles || []" size="small" border>
              <el-table-column label="圈子" min-width="180">
                <template #default="{ row }">
                  <CircleNameCell :row="row" />
                </template>
              </el-table-column>
              <el-table-column label="状态" width="110">
                <template #default="{ row }">
                  <el-tag size="small" :type="row.auditStatus === 'rejected' ? 'danger' : row.status === 'pending' ? 'warning' : 'info'">
                    {{ circleStateText(row) }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column label="风险分" width="80" prop="riskScore" />
              <el-table-column label="操作" width="120">
                <template #default="{ row }">
                  <el-button size="small" link type="primary" @click="viewDetail(row)">详情</el-button>
                  <el-button size="small" link @click="openContent(row)">内容</el-button>
                </template>
              </el-table-column>
            </el-table>
          </section>
        </div>

        <section class="glass-card panel">
          <div class="panel-title">长时间不活跃圈子</div>
          <el-table :data="overview.inactiveCircles || []" size="small" border>
            <el-table-column label="圈子" min-width="180">
              <template #default="{ row }">
                <CircleNameCell :row="row" />
              </template>
            </el-table-column>
            <el-table-column label="区域" width="120" prop="regionName" />
            <el-table-column label="最后活跃" width="180">
              <template #default="{ row }">{{ formatDate(row.lastActiveAt) }}</template>
            </el-table-column>
            <el-table-column label="建议" min-width="180">
              <template #default>可以置顶冷启动内容、联系圈主，或者合并到更活跃圈子。</template>
            </el-table-column>
          </el-table>
        </section>
      </el-tab-pane>

      <el-tab-pane label="圈子列表" name="list">
        <SearchPanel @search="loadCircles" @reset="resetFilters">
          <el-input v-model="filters.keyword" placeholder="搜索圈子名称/简介" clearable style="width: 220px" />
          <el-select v-model="filters.status" placeholder="圈子状态" clearable style="width: 130px">
            <el-option label="正常开放" value="active" />
            <el-option label="待审核" value="pending" />
            <el-option label="已禁用" value="disabled" />
            <el-option label="已解散" value="dissolved" />
          </el-select>
          <el-select v-model="filters.joinType" placeholder="加入方式" clearable style="width: 130px">
            <el-option label="直接加入" value="OPEN" />
            <el-option label="需要审核" value="APPLY" />
            <el-option label="邀请加入" value="INVITE" />
          </el-select>
          <RegionSelector v-model="filters.regionId" width="180px" />
        </SearchPanel>

        <div class="glass-card table-card">
          <el-table :data="circles" v-loading="loading" border stripe>
            <el-table-column label="圈子信息" min-width="260">
              <template #default="{ row }">
                <CircleNameCell :row="row" />
                <div class="row-desc">{{ row.description || '暂无简介' }}</div>
              </template>
            </el-table-column>
            <el-table-column label="圈主" min-width="180">
              <template #default="{ row }">
                <UserInline :user="row.owner" empty="未绑定圈主" />
              </template>
            </el-table-column>
            <el-table-column prop="regionName" label="区域" width="110" />
            <el-table-column label="加入方式" width="100">
              <template #default="{ row }">{{ joinTypeText(row.joinType) }}</template>
            </el-table-column>
            <el-table-column label="成员/申请" width="110">
              <template #default="{ row }">
                {{ row.memberCount || 0 }}
                <el-tag v-if="row.pendingMemberCount" size="small" type="warning">待审 {{ row.pendingMemberCount }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="帖子" width="80" prop="postCount" />
            <el-table-column label="状态" width="120">
              <template #default="{ row }">
                <el-tag size="small" :type="circleStateType(row)">{{ circleStateText(row) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="创建时间" width="170">
              <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
            </el-table-column>
            <el-table-column label="操作" width="250" fixed="right">
              <template #default="{ row }">
                <el-button size="small" link @click="viewDetail(row)">详情</el-button>
                <el-button v-if="hasEditPermission" size="small" link @click="openEdit(row)">编辑</el-button>
                <el-button v-if="hasEditPermission" size="small" link @click="viewMembers(row)">成员</el-button>
                <el-button size="small" link type="primary" @click="openContent(row)">内容</el-button>
                <el-button size="small" link type="primary" @click="openTopics(row)">话题</el-button>
                <el-dropdown v-if="hasEditPermission" trigger="click" @command="(cmd: string) => handleCommand(cmd, row)">
                  <el-button size="small" link type="primary">更多</el-button>
                  <template #dropdown>
                    <el-dropdown-menu>
                      <el-dropdown-item v-if="row.auditStatus === 'pending' || row.status === 'pending'" command="approve">通过审核</el-dropdown-item>
                      <el-dropdown-item v-if="row.auditStatus === 'pending' || row.status === 'pending'" command="reject">拒绝审核</el-dropdown-item>
                      <el-dropdown-item v-if="row.status === 'active'" command="disable">禁用</el-dropdown-item>
                      <el-dropdown-item v-if="row.status === 'disabled'" command="enable">启用</el-dropdown-item>
                      <el-dropdown-item v-if="hasDeletePermission" command="dissolve" divided>解散</el-dropdown-item>
                    </el-dropdown-menu>
                  </template>
                </el-dropdown>
              </template>
            </el-table-column>
          </el-table>
          <div class="table-footer">
            <el-pagination
              v-model:current-page="page"
              v-model:page-size="pageSize"
              :total="total"
              :page-sizes="[20, 50, 100]"
              layout="total, sizes, prev, pager, next"
              @current-change="loadCircles"
              @size-change="loadCircles"
            />
          </div>
        </div>
      </el-tab-pane>

      <el-tab-pane label="创建审核" name="audit">
        <SearchPanel @search="loadAuditList" @reset="resetAuditFilters">
          <el-input v-model="auditFilters.keyword" placeholder="搜索圈子名称/简介" clearable style="width: 240px" />
          <RegionSelector v-model="auditFilters.regionId" width="180px" />
        </SearchPanel>
        <div class="glass-card table-card">
          <el-table :data="auditList" v-loading="auditLoading" border stripe>
            <el-table-column label="申请圈子" min-width="260">
              <template #default="{ row }">
                <CircleNameCell :row="row" />
                <div class="row-desc">{{ row.description || '暂无简介' }}</div>
              </template>
            </el-table-column>
            <el-table-column label="申请人/圈主" min-width="180">
              <template #default="{ row }">
                <UserInline :user="row.owner" empty="未绑定申请人" />
              </template>
            </el-table-column>
            <el-table-column prop="regionName" label="区域" width="120" />
            <el-table-column label="加入方式" width="100">
              <template #default="{ row }">{{ joinTypeText(row.joinType) }}</template>
            </el-table-column>
            <el-table-column label="付费" width="100">
              <template #default="{ row }">{{ row.paidJoin ? `${row.price || 0} 元` : '免费' }}</template>
            </el-table-column>
            <el-table-column label="申请时间" width="170">
              <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
            </el-table-column>
            <el-table-column label="操作" width="190" fixed="right">
              <template #default="{ row }">
                <el-button v-if="hasEditPermission" size="small" type="success" @click="approveCircle(row)">通过</el-button>
                <el-button v-if="hasEditPermission" size="small" type="danger" @click="rejectCircle(row)">拒绝</el-button>
                <el-button size="small" @click="viewDetail(row)">详情</el-button>
              </template>
            </el-table-column>
          </el-table>
          <div class="table-footer">
            <el-pagination
              v-model:current-page="auditPage"
              v-model:page-size="auditPageSize"
              :total="auditTotal"
              :page-sizes="[20, 50, 100]"
              layout="total, sizes, prev, pager, next"
              @current-change="loadAuditList"
              @size-change="loadAuditList"
            />
          </div>
        </div>
      </el-tab-pane>
    </el-tabs>

    <el-dialog v-model="showCreateDialog" :title="editingCircle ? '编辑圈子' : '创建圈子'" width="760px" :close-on-click-modal="false">
      <el-form :model="circleForm" label-width="100px">
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="圈子名称" required>
              <el-input v-model="circleForm.name" placeholder="请输入圈子名称" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="区域" required>
              <RegionSelector v-model="circleForm.regionId" width="100%" :show-all-option="false" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="圈主用户">
          <el-select v-model="circleForm.ownerUserId" filterable clearable placeholder="选择对应的小程序用户" style="width: 100%">
            <el-option v-for="user in miniUsers" :key="user.id" :label="userOptionLabel(user)" :value="user.id" />
          </el-select>
          <div class="form-tip">运营者需要知道圈子对应哪个小程序用户，纠纷、违规和扶持都靠这个绑定。</div>
        </el-form-item>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="加入方式">
              <el-select v-model="circleForm.joinType" style="width: 100%">
                <el-option label="直接加入" value="OPEN" />
                <el-option label="需要审核" value="APPLY" />
                <el-option label="邀请加入" value="INVITE" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="最大成员数">
              <el-input-number v-model="circleForm.maxMembers" :min="1" :max="10000" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="圈子简介">
          <el-input v-model="circleForm.description" type="textarea" :rows="2" placeholder="用户进入圈子前看到的简介" />
        </el-form-item>
        <el-form-item label="圈子公告">
          <el-input v-model="circleForm.announcement" type="textarea" :rows="2" placeholder="圈子主页滚动公告或重要提示" />
        </el-form-item>
        <el-form-item label="圈规">
          <el-input v-model="circleForm.rules" type="textarea" :rows="3" placeholder="发帖、评论、广告、交易、冲突处理规则" />
        </el-form-item>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="图标">
              <ImageUploadBox v-model="circleForm.icon" scene="admin" shape="square" :max-size="2" placeholder="上传圈子图标" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="封面">
              <ImageUploadBox v-model="circleForm.cover" scene="admin" shape="wide" :max-size="5" placeholder="上传圈子封面" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="付费加入">
              <el-switch v-model="circleForm.paidJoin" />
            </el-form-item>
          </el-col>
          <el-col v-if="circleForm.paidJoin" :span="12">
            <el-form-item label="价格">
              <el-input-number v-model="circleForm.price" :min="0" :precision="2" />
              <span class="money-unit">元</span>
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="邀请码">
          <el-input v-model="circleForm.inviteCode" placeholder="邀请制圈子可填写" />
        </el-form-item>
        <el-form-item label="标签">
          <el-input v-model="circleForm.tagsInput" placeholder="多个标签用逗号分隔，例如：考研, 二手, 搭子" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateDialog = false">取消</el-button>
        <el-button type="primary" @click="saveCircle" :loading="saving">{{ editingCircle ? '保存' : '创建' }}</el-button>
      </template>
    </el-dialog>

    <el-drawer v-model="showDetail" title="圈子详情" size="620px">
      <template v-if="detailData">
        <div class="detail-hero">
          <el-avatar :size="52" :src="detailData.cover || detailData.icon">{{ (detailData.name || '?')[0] }}</el-avatar>
          <div>
            <div class="detail-title">{{ detailData.name }}</div>
            <div class="detail-sub">{{ detailData.regionName || '-' }} · {{ joinTypeText(detailData.joinType) }}</div>
          </div>
        </div>
        <el-descriptions :column="1" border>
          <el-descriptions-item label="圈子ID">{{ detailData.id }}</el-descriptions-item>
          <el-descriptions-item label="圈主">
            <UserInline :user="detailData.owner" empty="未绑定圈主" />
          </el-descriptions-item>
          <el-descriptions-item label="审核状态">
            <el-tag :type="detailData.auditStatus === 'approved' ? 'success' : detailData.auditStatus === 'pending' ? 'warning' : 'danger'">
              {{ auditStatusText(detailData.auditStatus) }}
            </el-tag>
            <span v-if="detailData.auditReason" class="reason-text">{{ detailData.auditReason }}</span>
          </el-descriptions-item>
          <el-descriptions-item label="成员/帖子">{{ detailData.memberCount || 0 }} / {{ detailData.postCount || 0 }}</el-descriptions-item>
          <el-descriptions-item label="公告">{{ detailData.announcement || '-' }}</el-descriptions-item>
          <el-descriptions-item label="圈规">{{ detailData.rules || '-' }}</el-descriptions-item>
          <el-descriptions-item label="简介">{{ detailData.description || '-' }}</el-descriptions-item>
          <el-descriptions-item label="付费">{{ detailData.paidJoin ? `${detailData.price || 0} 元` : '免费' }}</el-descriptions-item>
          <el-descriptions-item label="创建时间">{{ formatDate(detailData.createdAt) }}</el-descriptions-item>
        </el-descriptions>
      </template>
    </el-drawer>

    <el-drawer v-model="showMembers" title="成员治理" size="760px">
      <div v-if="currentCircle" class="drawer-head">
        <CircleNameCell :row="currentCircle" />
        <span class="muted">共 {{ memberTotal }} 名记录</span>
      </div>
      <el-table :data="memberList" v-loading="loadingMembers" border stripe>
        <el-table-column label="用户" min-width="190">
          <template #default="{ row }">
            <UserInline :user="row.user" />
            <div class="user-id">ID: {{ row.user?.id || row.userId }}</div>
          </template>
        </el-table-column>
        <el-table-column label="角色" width="100">
          <template #default="{ row }">
            <el-tag :type="row.role === 'OWNER' ? 'danger' : row.role === 'ADMIN' ? 'warning' : 'info'" size="small">
              {{ roleText(row.role) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="120">
          <template #default="{ row }">
            <el-tag size="small" :type="memberStatusType(row.status)">{{ memberStatusText(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="加入时间" width="170">
          <template #default="{ row }">{{ formatDate(row.joinAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="260" fixed="right">
          <template #default="{ row }">
            <el-button v-if="hasEditPermission && row.role !== 'OWNER'" size="small" link type="primary" @click="transferOwner(row)">设为圈主</el-button>
            <el-button v-if="hasEditPermission && row.role === 'MEMBER'" size="small" link @click="setMemberRole(row, 'ADMIN')">设管理员</el-button>
            <el-button v-if="hasEditPermission && row.role === 'ADMIN'" size="small" link @click="setMemberRole(row, 'MEMBER')">取消管理员</el-button>
            <el-button v-if="hasEditPermission && row.status !== 'muted' && row.role !== 'OWNER'" size="small" link type="warning" @click="muteMember(row)">禁言</el-button>
            <el-button v-if="hasEditPermission && row.status === 'muted'" size="small" link type="success" @click="unmuteMember(row)">解禁</el-button>
            <el-button v-if="hasDeletePermission && row.role !== 'OWNER'" size="small" link type="danger" @click="banMember(row)">拉黑</el-button>
            <el-button v-if="hasDeletePermission && row.role !== 'OWNER'" size="small" link type="danger" @click="removeMember(row)">踢出</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div class="table-footer">
        <el-pagination
          v-model:current-page="memberPage"
          v-model:page-size="memberPageSize"
          :total="memberTotal"
          :page-sizes="[50, 100]"
          layout="total, sizes, prev, pager, next"
          @current-change="loadMembers"
          @size-change="loadMembers"
        />
      </div>
    </el-drawer>

    <el-drawer v-model="showContent" title="圈内内容" size="860px">
      <div v-if="currentCircle" class="drawer-head">
        <CircleNameCell :row="currentCircle" />
        <span class="muted">这里能直接看圈内帖子和举报风险</span>
      </div>
      <el-tabs v-model="contentTab" @tab-change="handleContentTabChange">
        <el-tab-pane label="圈内帖子" name="posts">
          <SearchPanel @search="loadCirclePosts" @reset="resetPostFilters">
            <el-input v-model="postFilters.keyword" placeholder="搜索圈内内容" clearable style="width: 220px" />
            <el-select v-model="postFilters.status" placeholder="发布状态" clearable style="width: 130px">
              <el-option label="待审核" value="PENDING" />
              <el-option label="已发布" value="PUBLISHED" />
              <el-option label="已拒绝" value="REJECTED" />
              <el-option label="已删除" value="DELETED" />
            </el-select>
          </SearchPanel>
          <el-table :data="circlePosts" v-loading="postLoading" border stripe>
            <el-table-column label="内容" min-width="280">
              <template #default="{ row }">
                <div class="post-title">{{ row.title || row.content || '-' }}</div>
                <div class="post-images" v-if="row.images?.length">
                  <el-image v-for="(img, index) in row.images.slice(0, 3)" :key="index" :src="img" fit="cover" :preview-src-list="row.images" />
                </div>
              </template>
            </el-table-column>
            <el-table-column label="发布者" min-width="170">
              <template #default="{ row }"><UserInline :user="row.user" /></template>
            </el-table-column>
            <el-table-column label="互动" width="130">
              <template #default="{ row }">赞 {{ row.likeCount || 0 }} / 评 {{ row.commentCount || 0 }}</template>
            </el-table-column>
            <el-table-column label="举报" width="80">
              <template #default="{ row }">
                <el-tag v-if="row.reportCount" type="danger" size="small">{{ row.reportCount }}</el-tag>
                <span v-else>0</span>
              </template>
            </el-table-column>
            <el-table-column label="状态" width="110">
              <template #default="{ row }">{{ postStatusText(row.status) }}</template>
            </el-table-column>
            <el-table-column label="时间" width="170">
              <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
            </el-table-column>
          </el-table>
        </el-tab-pane>
        <el-tab-pane label="举报记录" name="reports">
          <el-table :data="circleReports" v-loading="reportLoading" border stripe>
            <el-table-column label="举报对象" width="120">
              <template #default="{ row }">{{ targetTypeText(row.targetType) }}</template>
            </el-table-column>
            <el-table-column label="举报原因" min-width="220">
              <template #default="{ row }">
                <div>{{ row.reason }}</div>
                <div class="row-desc">{{ row.detail || '-' }}</div>
              </template>
            </el-table-column>
            <el-table-column label="举报人" min-width="160">
              <template #default="{ row }"><UserInline :user="row.reporter" /></template>
            </el-table-column>
            <el-table-column label="被举报人" min-width="160">
              <template #default="{ row }"><UserInline :user="row.reported" empty="-" /></template>
            </el-table-column>
            <el-table-column label="状态" width="100" prop="status" />
            <el-table-column label="时间" width="170">
              <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
            </el-table-column>
          </el-table>
        </el-tab-pane>
      </el-tabs>
    </el-drawer>

    <el-drawer v-model="showTopics" title="圈子话题" size="760px">
      <div v-if="currentCircle" class="drawer-head">
        <CircleNameCell :row="currentCircle" />
        <el-button type="primary" @click="addTopicHeader">新增分栏</el-button>
      </div>

      <div v-loading="topicLoading" class="topic-stack">
        <section v-for="(header, hIndex) in topicHeaders" :key="header.localKey || header.id" class="topic-section">
          <div class="topic-header-row">
            <el-input v-model="header.title" placeholder="分栏名称，例如：公告、交流、问答" />
            <el-input-number v-model="header.sort_order" :min="0" controls-position="right" style="width: 120px" />
            <el-switch v-model="header.isActive" active-text="启用" />
            <el-button type="danger" link @click="removeTopicHeader(header, hIndex)">删除</el-button>
          </div>
          <el-input v-model="header.description" placeholder="分栏说明，可选" class="topic-description" />
          <div class="topic-list">
            <div v-for="(topic, tIndex) in header.topics" :key="topic.localKey || topic.id" class="topic-row">
              <el-input v-model="topic.title" placeholder="话题名称" />
              <ImageUploadBox v-model="topic.logo" scene="topic-logo" shape="square" :max-size="2" placeholder="图标" />
              <el-input-number v-model="topic.sort_order" :min="0" controls-position="right" style="width: 120px" />
              <el-button type="danger" link @click="removeTopic(header, tIndex, topic)">删除</el-button>
            </div>
          </div>
          <el-button class="add-topic-btn" @click="addTopic(header)">新增话题</el-button>
        </section>
        <EmptyState v-if="!topicHeaders.length" description="暂无话题分栏" />
      </div>

      <template #footer>
        <el-button @click="showTopics = false">关闭</el-button>
        <el-button type="primary" :loading="topicSaving" @click="saveTopicHeaders">保存话题</el-button>
      </template>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, onMounted, reactive, ref } from 'vue'
import { ElAvatar, ElMessage, ElMessageBox } from 'element-plus'
import { request } from '@/api/request'
import PageHeader from '@/components/common/PageHeader.vue'
import SearchPanel from '@/components/common/SearchPanel.vue'
import RegionSelector from '@/components/common/RegionSelector.vue'
import ImageUploadBox from '@/components/common/ImageUploadBox.vue'
import StatGrid from '@/components/glass/StatGrid.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const hasEditPermission = ref(auth.permissions.includes('community:edit'))
const hasDeletePermission = ref(auth.permissions.includes('community:edit'))

const CircleNameCell = defineComponent({
  props: { row: { type: Object, required: true } },
  setup(props) {
    return () => h('div', { class: 'circle-cell' }, [
      h(ElAvatar, { size: 38, src: (props.row as any).cover || (props.row as any).icon }, () => String((props.row as any).name || '?').slice(0, 1)),
      h('div', [
        h('div', { class: 'circle-name' }, (props.row as any).name || '-'),
        h('div', { class: 'circle-sub' }, `${(props.row as any).regionName || '未分区'} · ${joinTypeText((props.row as any).joinType)}`),
      ]),
    ])
  },
})

const UserInline = defineComponent({
  props: { user: { type: Object, default: null }, empty: { type: String, default: '-' } },
  setup(props) {
    return () => {
      const user: any = props.user
      if (!user) return h('span', { class: 'muted' }, props.empty)
      return h('div', { class: 'user-inline' }, [
        h(ElAvatar, { size: 28, src: user.avatar }, () => String(user.nickname || '用').slice(0, 1)),
        h('div', [
          h('div', { class: 'user-name' }, user.nickname || '未设置昵称'),
          h('div', { class: 'user-sub' }, user.phone || (user.uid ? `UID ${user.uid}` : user.id)),
        ]),
      ])
    }
  },
})

const activeTab = ref('overview')
const loading = ref(false)
const overviewLoading = ref(false)
const auditLoading = ref(false)
const saving = ref(false)
const circles = ref<any[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const auditList = ref<any[]>([])
const auditTotal = ref(0)
const auditPage = ref(1)
const auditPageSize = ref(20)
const miniUsers = ref<any[]>([])

const overview = reactive<any>({
  total: 0,
  active: 0,
  pendingAudit: 0,
  pendingJoinApplications: 0,
  totalMembers: 0,
  totalPosts: 0,
  todayPosts: 0,
  weekPosts: 0,
  pendingReports: 0,
  paidRevenue: 0,
  hotCircles: [],
  riskyCircles: [],
  inactiveCircles: [],
})

const filters = reactive({ keyword: '', status: '', joinType: '', regionId: '' })
const auditFilters = reactive({ keyword: '', regionId: '' })
const postFilters = reactive({ keyword: '', status: '' })

const showCreateDialog = ref(false)
const editingCircle = ref<any>(null)
const showDetail = ref(false)
const detailData = ref<any>(null)
const showMembers = ref(false)
const currentCircle = ref<any>(null)
const loadingMembers = ref(false)
const memberList = ref<any[]>([])
const memberTotal = ref(0)
const memberPage = ref(1)
const memberPageSize = ref(50)
const showContent = ref(false)
const contentTab = ref('posts')
const postLoading = ref(false)
const reportLoading = ref(false)
const circlePosts = ref<any[]>([])
const circleReports = ref<any[]>([])
const showTopics = ref(false)
const topicLoading = ref(false)
const topicSaving = ref(false)
const topicHeaders = ref<any[]>([])

const circleForm = reactive({
  name: '',
  regionId: '',
  ownerUserId: '',
  joinType: 'OPEN',
  description: '',
  announcement: '',
  rules: '',
  icon: '',
  cover: '',
  maxMembers: 500,
  paidJoin: false,
  price: 0,
  inviteCode: '',
  tagsInput: '',
})

const statItems = computed(() => [
  { label: '总圈子', value: overview.total || 0, sub: '全部区域圈子数量', icon: 'Connection' },
  { label: '正常开放', value: overview.active || 0, sub: '用户可进入和发帖', tone: 'green' as const, icon: 'CircleCheck' },
  { label: '待审核圈子', value: overview.pendingAudit || 0, sub: '需要运营处理', tone: overview.pendingAudit ? 'orange' as const : 'blue' as const, icon: 'Clock' },
  { label: '待审成员', value: overview.pendingJoinApplications || 0, sub: '圈主/管理员要处理', tone: overview.pendingJoinApplications ? 'orange' as const : 'blue' as const, icon: 'User' },
  { label: '圈内帖子', value: overview.totalPosts || 0, sub: `今日 ${overview.todayPosts || 0}，近7天 ${overview.weekPosts || 0}`, icon: 'Document' },
  { label: '待处理举报', value: overview.pendingReports || 0, sub: '圈内内容风险', tone: overview.pendingReports ? 'red' as const : 'blue' as const, icon: 'Warning' },
])

const unwrapList = (res: any) => res?.data?.list || res?.list || []
const unwrapTotal = (res: any) => res?.data?.total ?? res?.total ?? 0
const formatDate = (value: any) => value ? new Date(value).toLocaleString('zh-CN') : '-'
const joinTypeText = (value: string) => ({ OPEN: '直接加入', APPLY: '需要审核', INVITE: '邀请加入' } as any)[value] || '直接加入'
const auditStatusText = (value: string) => ({ pending: '待审核', approved: '已通过', rejected: '已拒绝' } as any)[value || 'approved'] || '已通过'
const roleText = (value: string) => ({ OWNER: '圈主', ADMIN: '管理员', MEMBER: '成员' } as any)[value] || '成员'
const memberStatusText = (value: string) => ({ pending: '待审核', active: '正常', muted: '已禁言', banned: '已拉黑', rejected: '已拒绝' } as any)[value || 'active'] || '正常'
const memberStatusType = (value: string) => value === 'active' ? 'success' : value === 'pending' ? 'warning' : value === 'muted' ? 'info' : 'danger'
const postStatusText = (value: string) => ({ PENDING: '待审核', PUBLISHED: '已发布', REJECTED: '已拒绝', DELETED: '已删除', DRAFT: '草稿' } as any)[value] || value || '-'
const targetTypeText = (value: string) => ({ circle: '圈子', post: '帖子', comment: '评论' } as any)[value] || value || '-'
const circleStateType = (row: any) => row.auditStatus === 'rejected' || row.status === 'disabled' ? 'danger' : row.auditStatus === 'pending' || row.status === 'pending' ? 'warning' : row.status === 'active' ? 'success' : 'info'
const circleStateText = (row: any) => row.auditStatus === 'pending' || row.status === 'pending' ? '待审核' : row.auditStatus === 'rejected' ? '审核拒绝' : row.status === 'active' ? '正常开放' : row.status === 'disabled' ? '已禁用' : row.status === 'dissolved' ? '已解散' : row.status || '-'
const userOptionLabel = (user: any) => `${user?.nickname || '未设置昵称'}${user?.phone ? ` · ${user.phone}` : ''} · ${user?.uid ? `UID ${user.uid}` : user?.id}`
const ensureMiniUserOption = (user: any) => {
  if (!user?.id || miniUsers.value.some((item: any) => item.id === user.id)) return
  miniUsers.value.unshift(user)
}

const loadMiniUsers = async () => {
  const res: any = await request.get('/admin/users', { params: { page: 1, pageSize: 300, status: 'active', userType: 1 } })
  miniUsers.value = Array.isArray(res) ? res : res?.list || res?.data?.list || []
}

const loadOverview = async () => {
  overviewLoading.value = true
  try {
    const res: any = await request.get('/admin/circles/operations/overview')
    Object.assign(overview, res.data || res || {})
  } catch (e: any) {
    ElMessage.error(e?.message || '加载圈子运营总览失败')
  } finally {
    overviewLoading.value = false
  }
}

const loadCircles = async () => {
  loading.value = true
  try {
    const res: any = await request.get('/admin/circles', { params: { page: page.value, pageSize: pageSize.value, ...filters } })
    circles.value = unwrapList(res)
    total.value = unwrapTotal(res)
  } catch (e: any) {
    ElMessage.error(e?.message || '加载圈子列表失败')
    circles.value = []
  } finally {
    loading.value = false
  }
}

const loadAuditList = async () => {
  auditLoading.value = true
  try {
    const res: any = await request.get('/admin/circles/audit/list', { params: { page: auditPage.value, pageSize: auditPageSize.value, ...auditFilters } })
    auditList.value = unwrapList(res)
    auditTotal.value = unwrapTotal(res)
  } catch (e: any) {
    ElMessage.error(e?.message || '加载圈子审核列表失败')
    auditList.value = []
  } finally {
    auditLoading.value = false
  }
}

const loadAll = async () => {
  await Promise.all([loadOverview(), loadCircles(), loadAuditList(), loadMiniUsers().catch(() => undefined)])
}

const resetFilters = () => {
  Object.assign(filters, { keyword: '', status: '', joinType: '', regionId: '' })
  page.value = 1
  loadCircles()
}

const resetAuditFilters = () => {
  Object.assign(auditFilters, { keyword: '', regionId: '' })
  auditPage.value = 1
  loadAuditList()
}

const resetPostFilters = () => {
  Object.assign(postFilters, { keyword: '', status: '' })
  loadCirclePosts()
}

const resetForm = () => {
  Object.assign(circleForm, {
    name: '',
    regionId: '',
    ownerUserId: '',
    joinType: 'OPEN',
    description: '',
    announcement: '',
    rules: '',
    icon: '',
    cover: '',
    maxMembers: 500,
    paidJoin: false,
    price: 0,
    inviteCode: '',
    tagsInput: '',
  })
}

const openCreate = () => {
  editingCircle.value = null
  resetForm()
  showCreateDialog.value = true
}

const openEdit = (row: any) => {
  editingCircle.value = row
  ensureMiniUserOption(row.owner)
  Object.assign(circleForm, {
    name: row.name || '',
    regionId: row.regionId || '',
    ownerUserId: row.ownerUserId || row.owner?.id || '',
    joinType: row.joinType || 'OPEN',
    description: row.description || '',
    announcement: row.announcement || '',
    rules: row.rules || '',
    icon: row.icon || '',
    cover: row.cover || '',
    maxMembers: row.maxMembers || 500,
    paidJoin: !!row.paidJoin,
    price: Number(row.price || 0),
    inviteCode: row.inviteCode || '',
    tagsInput: Array.isArray(row.tags) ? row.tags.join(', ') : '',
  })
  showCreateDialog.value = true
}

const saveCircle = async () => {
  if (!circleForm.name || !circleForm.regionId) {
    ElMessage.warning('请填写圈子名称和区域')
    return
  }
  saving.value = true
  try {
    const payload: any = { ...circleForm }
    payload.tags = payload.tagsInput ? payload.tagsInput.split(/[,\n，]/).map((item: string) => item.trim()).filter(Boolean) : []
    delete payload.tagsInput
    if (editingCircle.value) {
      await request.put(`/admin/circles/${editingCircle.value.id}`, payload)
      ElMessage.success('圈子已更新')
    } else {
      await request.post('/admin/circles', payload)
      ElMessage.success('圈子已创建')
    }
    showCreateDialog.value = false
    await loadAll()
  } catch (e: any) {
    ElMessage.error(e?.message || '保存圈子失败')
  } finally {
    saving.value = false
  }
}

const approveCircle = async (row: any) => {
  await request.put(`/admin/circles/audit/${row.id}`, { status: 'approved', reason: '运营审核通过' })
  ElMessage.success('圈子已通过')
  await loadAll()
}

const rejectCircle = async (row: any) => {
  const { value } = await ElMessageBox.prompt('请输入拒绝原因，用户和运营都能看懂', '拒绝圈子', {
    confirmButtonText: '拒绝',
    cancelButtonText: '取消',
    inputPlaceholder: '例如：圈子名称不清晰、疑似广告、资料不完整',
  })
  await request.put(`/admin/circles/audit/${row.id}`, { status: 'rejected', reason: value || '运营审核不通过' })
  ElMessage.success('已拒绝')
  await loadAll()
}

const handleCommand = async (cmd: string, row: any) => {
  try {
    if (cmd === 'approve') await approveCircle(row)
    else if (cmd === 'reject') await rejectCircle(row)
    else if (cmd === 'disable') {
      await request.put(`/admin/circles/${row.id}/status`, { status: 'disabled' })
      ElMessage.success('圈子已禁用')
      await loadAll()
    } else if (cmd === 'enable') {
      await request.put(`/admin/circles/${row.id}/status`, { status: 'active', auditStatus: 'approved' })
      ElMessage.success('圈子已启用')
      await loadAll()
    } else if (cmd === 'dissolve') {
      await ElMessageBox.confirm(`确定解散圈子“${row.name}”？`, '确认')
      await request.put(`/admin/circles/${row.id}/dissolve`)
      ElMessage.success('圈子已解散')
      await loadAll()
    }
  } catch (e: any) {
    if (e !== 'cancel') ElMessage.error(e?.message || '操作失败')
  }
}

const viewDetail = async (row: any) => {
  try {
    const res: any = await request.get(`/admin/circles/${row.id}`)
    detailData.value = res.data || res
    ensureMiniUserOption(detailData.value.owner)
    showDetail.value = true
  } catch (e: any) {
    ElMessage.error(e?.message || '获取圈子详情失败')
  }
}

const viewMembers = (row: any) => {
  currentCircle.value = row
  memberPage.value = 1
  showMembers.value = true
  loadMembers()
}

const loadMembers = async () => {
  if (!currentCircle.value) return
  loadingMembers.value = true
  try {
    const res: any = await request.get(`/admin/circles/${currentCircle.value.id}/members`, {
      params: { page: memberPage.value, limit: memberPageSize.value },
    })
    memberList.value = unwrapList(res)
    memberTotal.value = unwrapTotal(res)
  } catch (e: any) {
    ElMessage.error(e?.message || '加载成员失败')
  } finally {
    loadingMembers.value = false
  }
}

const setMemberRole = async (row: any, role: string) => {
  await request.put(`/admin/circles/${currentCircle.value.id}/members/${row.id}/role`, { role })
  ElMessage.success(role === 'ADMIN' ? '已设为管理员' : '已取消管理员')
  await loadMembers()
}

const muteMember = async (row: any) => {
  const { value } = await ElMessageBox.prompt('禁言天数', '圈内禁言', { inputValue: '7', confirmButtonText: '禁言', cancelButtonText: '取消' })
  await request.put(`/admin/circles/${currentCircle.value.id}/members/${row.id}/mute`, { days: Number(value) || 7, reason: '圈内违规禁言' })
  ElMessage.success('已禁言')
  await loadMembers()
}

const unmuteMember = async (row: any) => {
  await request.put(`/admin/circles/${currentCircle.value.id}/members/${row.id}/unmute`)
  ElMessage.success('已解除禁言')
  await loadMembers()
}

const banMember = async (row: any) => {
  await ElMessageBox.confirm(`确定将“${row.user?.nickname || row.userId}”拉黑出该圈子？`, '确认')
  await request.put(`/admin/circles/${currentCircle.value.id}/members/${row.id}/ban`, { reason: '圈内违规拉黑' })
  ElMessage.success('已拉黑')
  await loadMembers()
  await loadCircles()
}

const removeMember = async (row: any) => {
  await ElMessageBox.confirm(`确定踢出“${row.user?.nickname || row.userId}”？`, '确认')
  await request.delete(`/admin/circles/members/${row.id}`)
  ElMessage.success('已踢出')
  await loadMembers()
  await loadCircles()
}

const transferOwner = async (row: any) => {
  await ElMessageBox.confirm(`确定把“${row.user?.nickname || row.userId}”设为新圈主？`, '转让圈主')
  await request.put(`/admin/circles/${currentCircle.value.id}/transfer-owner`, { memberId: row.id })
  ElMessage.success('圈主已转让')
  await loadMembers()
  await loadCircles()
}

const openContent = (row: any) => {
  currentCircle.value = row
  contentTab.value = 'posts'
  showContent.value = true
  loadCirclePosts()
  loadCircleReports()
}

const loadCirclePosts = async () => {
  if (!currentCircle.value) return
  postLoading.value = true
  try {
    const res: any = await request.get(`/admin/circles/${currentCircle.value.id}/posts`, { params: postFilters })
    circlePosts.value = unwrapList(res)
  } catch (e: any) {
    ElMessage.error(e?.message || '加载圈内帖子失败')
  } finally {
    postLoading.value = false
  }
}

const loadCircleReports = async () => {
  if (!currentCircle.value) return
  reportLoading.value = true
  try {
    const res: any = await request.get(`/admin/circles/${currentCircle.value.id}/reports`)
    circleReports.value = unwrapList(res)
  } catch (e: any) {
    ElMessage.error(e?.message || '加载圈内举报失败')
  } finally {
    reportLoading.value = false
  }
}

const handleContentTabChange = () => {
  if (contentTab.value === 'posts') loadCirclePosts()
  if (contentTab.value === 'reports') loadCircleReports()
}

const normalizeTopicHeaders = (items: any[]) => (items || []).map((header: any, hIndex: number) => ({
  id: header.id,
  localKey: header.id || `header-${Date.now()}-${hIndex}`,
  title: header.title || header.name || '',
  description: header.description || '',
  sort_order: Number(header.sort_order ?? header.sortOrder ?? hIndex + 1),
  isActive: header.isActive !== false && header.is_active !== 0,
  topics: (header.topics || []).map((topic: any, tIndex: number) => ({
    id: topic.id || topic.topicId || topic.topic_id,
    bindId: topic.bindId || topic.bind_id,
    localKey: topic.id || topic.topicId || `topic-${Date.now()}-${hIndex}-${tIndex}`,
    title: topic.title || topic.name || '',
    description: topic.description || '',
    logo: topic.logo || topic.cover || topic.icon || '',
    sort_order: Number(topic.sort_order ?? topic.sortOrder ?? tIndex + 1),
  })),
}))

const openTopics = async (row: any) => {
  currentCircle.value = row
  showTopics.value = true
  await loadTopicHeaders()
}

const loadTopicHeaders = async () => {
  if (!currentCircle.value?.id) return
  topicLoading.value = true
  try {
    const res: any = await request.get(`/admin/circles/${currentCircle.value.id}/topic-headers`)
    topicHeaders.value = normalizeTopicHeaders(res?.data || res?.list || res || [])
  } catch (e: any) {
    ElMessage.error(e?.message || '加载话题失败')
  } finally {
    topicLoading.value = false
  }
}

const addTopicHeader = () => {
  topicHeaders.value.push({
    localKey: `new-header-${Date.now()}`,
    title: '',
    description: '',
    sort_order: topicHeaders.value.length + 1,
    isActive: true,
    topics: [],
  })
}

const addTopic = (header: any) => {
  header.topics.push({
    localKey: `new-topic-${Date.now()}`,
    title: '',
    description: '',
    logo: '',
    sort_order: header.topics.length + 1,
  })
}

const removeTopicHeader = async (header: any, index: number) => {
  if (header.id && currentCircle.value?.id) {
    await ElMessageBox.confirm(`确定删除分栏"${header.title || '-'}"？`, '确认', { type: 'warning' })
    await request.delete(`/admin/circles/${currentCircle.value.id}/topic-headers/${header.id}`)
    ElMessage.success('分栏已删除')
    await loadTopicHeaders()
    return
  }
  topicHeaders.value.splice(index, 1)
}

const removeTopic = async (header: any, index: number, topic: any) => {
  if (header.id && topic.id && currentCircle.value?.id) {
    await request.delete(`/admin/circles/${currentCircle.value.id}/topic-headers/${header.id}/topics/${topic.id}`)
    ElMessage.success('话题已解绑')
    await loadTopicHeaders()
    return
  }
  header.topics.splice(index, 1)
}

const saveTopicHeaders = async () => {
  if (!currentCircle.value?.id) return
  const headers = topicHeaders.value
    .map((header: any, hIndex: number) => ({
      title: String(header.title || '').trim(),
      description: header.description || '',
      sort_order: Number(header.sort_order || hIndex + 1),
      is_active: header.isActive ? 1 : 0,
      topics: (header.topics || []).map((topic: any, tIndex: number) => ({
        topic_id: topic.id,
        title: String(topic.title || '').trim(),
        description: topic.description || '',
        logo: topic.logo || '',
        sort_order: Number(topic.sort_order || tIndex + 1),
      })).filter((topic: any) => topic.title),
    }))
    .filter((header: any) => header.title)
  if (!headers.length) {
    ElMessage.warning('请至少填写一个分栏')
    return
  }
  topicSaving.value = true
  try {
    await request.post(`/admin/circles/${currentCircle.value.id}/topic-headers/batch-create`, { headers })
    ElMessage.success('话题已保存')
    await loadTopicHeaders()
  } catch (e: any) {
    ElMessage.error(e?.message || '保存话题失败')
  } finally {
    topicSaving.value = false
  }
}

const handleTabChange = () => {
  if (activeTab.value === 'overview') loadOverview()
  if (activeTab.value === 'list') loadCircles()
  if (activeTab.value === 'audit') loadAuditList()
}

onMounted(loadAll)
</script>

<style scoped>
.page-container { padding: 24px; }
.glass-card {
  background: var(--mx-card);
  border: 1px solid var(--mx-border);
  border-radius: 14px;
  box-shadow: var(--mx-shadow);
}
.circle-tabs { margin-top: 8px; }
.overview-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  margin-bottom: 16px;
}
.panel { padding: 16px; }
.panel-title { margin-bottom: 12px; font-size: 16px; font-weight: 800; color: var(--mx-text); }
.table-card { padding: 0; overflow: hidden; }
.circle-cell, .user-inline, .detail-hero, .drawer-head { display: flex; align-items: center; gap: 10px; }
.circle-name, .detail-title, .post-title { font-weight: 700; color: var(--mx-text); }
.circle-sub, .user-sub, .row-desc, .muted, .user-id, .detail-sub { font-size: 12px; color: var(--mx-muted); }
.row-desc { margin-top: 4px; line-height: 1.5; }
.user-name { font-size: 13px; font-weight: 700; color: var(--mx-text); }
.table-footer { padding: 16px; display: flex; justify-content: flex-end; }
.form-tip { margin-top: 6px; font-size: 12px; color: var(--mx-muted); line-height: 1.5; }
.money-unit, .reason-text { margin-left: 8px; color: var(--mx-muted); }
.detail-hero { margin-bottom: 16px; padding: 14px; background: var(--mx-soft); border-radius: 10px; }
.drawer-head { justify-content: space-between; margin-bottom: 14px; }
.post-images { display: flex; gap: 6px; margin-top: 8px; }
.post-images :deep(.el-image) { width: 48px; height: 48px; border-radius: 6px; }
.topic-stack { display: flex; flex-direction: column; gap: 14px; }
.topic-section {
  padding: 14px;
  border: 1px solid var(--mx-border);
  border-radius: 6px;
  background: var(--mx-card);
}
.topic-header-row, .topic-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto auto;
  gap: 10px;
  align-items: center;
}
.topic-description { margin-top: 10px; }
.topic-list { display: flex; flex-direction: column; gap: 10px; margin-top: 12px; }
.topic-row { grid-template-columns: minmax(0, 1fr) 112px auto auto; }
.add-topic-btn { margin-top: 12px; }
@media (max-width: 1280px) {
  .overview-grid { grid-template-columns: 1fr; }
}
</style>
