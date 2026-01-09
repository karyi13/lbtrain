"""
CLI模块 - 提供命令行接口功能
"""
import argparse
import pandas as pd
from pathlib import Path
from typing import Optional
import logging
from datetime import datetime, timedelta

from depend.services import CompositeDataFetcher, DataValidator, DataStorage
from depend.di_container import container
from depend.monitoring import monitoring_manager


def main():
    """主函数 - 执行A股连板分析"""
    print("A股连板分析工具启动...")
    
    # 从依赖注入容器获取服务
    data_fetcher = container.get('data_fetcher')
    data_validator = container.get('data_validator')
    data_storage = container.get('data_storage')
    
    # 设置参数
    start_date = '20241220'  # 可以从配置或命令行参数获取
    end_date = datetime.now().strftime('%Y%m%d')
    
    try:
        # 获取股票列表
        print("正在获取股票列表...")
        stocks = data_fetcher.get_stock_list()
        print(f"获取到 {len(stocks)} 只股票")
        
        # 这里可以添加连板分析逻辑
        # 例如：获取涨停股票、分析连板趋势等
        
        print("A股连板分析完成")
        
    except Exception as e:
        print(f"执行过程中出现错误: {e}")
        import traceback
        traceback.print_exc()


def save_monitoring_metrics():
    """保存监控指标"""
    print("正在保存监控指标...")
    try:
        monitoring_manager.save_metrics()
        print("监控指标保存完成")
    except Exception as e:
        print(f"保存监控指标时出错: {e}")


if __name__ == "__main__":
    main()