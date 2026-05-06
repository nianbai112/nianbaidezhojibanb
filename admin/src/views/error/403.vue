<template>
  <a-result
    status="403"
    title="403"
    sub-title="抱歉，您没有访问此页面的权限"
  >
    <template #extra>
      <a-button type="primary" @click="$router.push('/dashboard')">返回工作台</a-button>
      <a-button @click="$router.back()">返回上一页</a-button>
    </template>
  </a-result>
</template>
