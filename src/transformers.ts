import _ from 'lodash';
import flatten from './core/utils/flatten';
import TimeSeries from './core/time_series2';
import TableModel from './core/table_model';

let transformers = {};

transformers['timeseries_to_rows'] = {
  description: 'Time series to rows',
  getColumns: function() {
    return [];
  },
  transform: function(data, panel, model) {
    model.columns = [{text: 'Time', type: 'date'}, {text: 'Metric'}, {text: 'Value'}];

    for (let i = 0; i < data.length; i++) {
      let series = data[i];
      for (let y = 0; y < series.datapoints.length; y++) {
        let dp = series.datapoints[y];
        model.rows.push([dp[1], series.target, dp[0]]);
      }
    }
  },
};

transformers['timeseries_to_columns'] = {
  description: 'Time series to columns',
  getColumns: function() {
    return [];
  },
  transform: function(data, panel, model) {
    model.columns.push({text: 'Time', type: 'date'});

    // group by time
    let points = {};

    for (let i = 0; i < data.length; i++) {
      let series = data[i];
      model.columns.push({text: series.target});

      for (let y = 0; y < series.datapoints.length; y++) {
        let dp = series.datapoints[y];
        let timeKey = dp[1].toString();

        if (!points[timeKey]) {
          points[timeKey] = {time: dp[1]};
          points[timeKey][i] = dp[0];
        } else {
          points[timeKey][i] = dp[0];
        }
      }
    }

    for (let time in points) {
      let point = points[time];
      let values = [point.time];

      for (let i = 0; i < data.length; i++) {
        let value = point[i];
        values.push(value);
      }

      model.rows.push(values);
    }
  },
};

transformers['timeseries_aggregations'] = {
  description: 'Time series aggregations',
  columns_default: [
    {text: 'Index', value: 'index'},
    {text: 'Metric', value: 'metric'},
    {text: 'Avg', value: 'avg'},
    {text: 'Min', value: 'min'},
    {text: 'Max', value: 'max'},
    {text: 'Total', value: 'total'},
    {text: 'Current', value: 'current'},
    {text: 'Count', value: 'count'},
  ],
  columns_parsing: [],
  getColumns: function() {
    let cols = this.columns_default.slice();

    for (let i = 0; i < this.columns_parsing.length; i++)
      cols.push(this.columns_parsing[i]);

    return cols;
  },
  transform: function(data, panel, model) {
    let i, y;

    // model.columns.push({text: 'Metric'});

    if (data.length > 0) {
      // clear it
      this.columns_parsing = [];

      // get all column names
      let _map;
      eval('_map = ' + data[0].alias.replace(/=\"/g, ':"'));
      for (var key in _map) {
        this.columns_parsing.push({text: '__' + key, value: '__' + key});
      }
    }

    let choosen_metric = 0;
    for (i = 0; i < panel.columns.length; i++) {
      model.columns.push({text: panel.columns[i].text});

      if (panel.columns[i].text.match('Metric')) {
        choosen_metric = 1;
      }
    }

    // every Metric is uniqe in timeseries_aggregations mode
    // so do not need to merge value
    if (choosen_metric) {
      for (i = 0; i < data.length; i++) {
        let series = new TimeSeries({
          datapoints: data[i].datapoints,
          alias: data[i].target,
        });

        series.getFlotPairs('connected');
        series.stats.index = i + 1;
        series.stats.metric = data[i].alias;

        let _map;
        eval('_map = ' + data[i].alias.replace(/=\"/g, ':"'));
        for (var key in _map) {
          series.stats['__' + key] = _map[key];
        }

        let cells = [];
        for (y = 0; y < panel.columns.length; y++) {
          cells.push(series.stats[panel.columns[y].value]);
        }

        model.rows.push(cells);
      }
    } else {
      // new: auto merged by choosen col
      // get choosen cols
      let cols = [];
      for (i = 0; i < panel.columns.length; i++) {
        if (panel.columns[i].text.match(/^__.*/)) {
          cols.push(panel.columns[i].text.replace(/^__/, ''));
        }
      }

      // merge data
      let keys = [];
      let rows = {};
      for (let i = 0, datalen = data.length; i < datalen; i++) {
        let labels;
        eval('labels = ' + data[i].alias.replace(/=\"/g, ':"'));

        let key = '';
        for (var j = 0, len = cols.length; j < len; j++) {
          key = key + labels[cols[j]] + '|';
        }

        let row = rows[key];
        if (row == undefined) {
          row = {};

          row.lables = labels;
          row.metrics = [];

          row.metrics.push(data[i]);

          keys.push(key);
          rows[key] = row;
        } else {
          row.metrics.push(data[i]);
        }
      }

      for (let i = 0, keys_cnt = keys.length; i < keys_cnt; i++) {
        let row = rows[keys[i]];

        let series_arr = [];
        let count = 0;
        let total = 0;
        let min = null;
        let max = null;
        let current = 0;
        for (let i = 0, metrics_cnt = row.metrics.length; i < metrics_cnt; i++) {
          let series = new TimeSeries({
            datapoints: row.metrics[i].datapoints,
            alias: row.metrics[i].alias,
          });

          series.getFlotPairs('connected');

          count += series.stats.count;
          total += series.stats.total;
          current += series.stats.current;

          if (min == null || min > series.stats.min) min = series.stats.min;
          if (max == null || max < series.stats.max) max = series.stats.max;

          series_arr.push(series);
        }

        let result;
        result = {};

        result.min = min;
        result.max = max;
        result.total = total;
        result.count = count;
        result.avg = total / count;
        result.current = current;

        result.index = i + 1;
        // result.metrics = keys[i] // no need it, we are sure it will not get metrics in this case

        let labels = row.lables;
        for (var key in labels) {
          result['__' + key] = labels[key];
        }

        let cells = [];
        for (y = 0; y < panel.columns.length; y++) {
          cells.push(result[panel.columns[y].value]);
        }

        model.rows.push(cells);
      }
    }
  },
};

transformers['annotations'] = {
  description: 'Annotations',
  getColumns: function() {
    return [];
  },
  transform: function(data, panel, model) {
    model.columns.push({text: 'Time', type: 'date'});
    model.columns.push({text: 'Title'});
    model.columns.push({text: 'Text'});
    model.columns.push({text: 'Tags'});

    if (!data || !data.annotations || data.annotations.length === 0) {
      return;
    }

    for (let i = 0; i < data.annotations.length; i++) {
      let evt = data.annotations[i];
      model.rows.push([evt.time, evt.title, evt.text, evt.tags]);
    }
  },
};

transformers['table'] = {
  description: 'Table',
  getColumns: function(data) {
    if (!data || data.length === 0) {
      return [];
    }

    // Single query returns data columns as is
    if (data.length === 1) {
      return [...data[0].columns];
    }

    // Track column indexes: name -> index
    const columnNames = {};

    // Union of all columns
    const columns = data.reduce((acc, series) => {
      series.columns.forEach(col => {
        const {text} = col;
        if (columnNames[text] === undefined) {
          columnNames[text] = acc.length;
          acc.push(col);
        }
      });
      return acc;
    }, []);

    return columns;
  },
  transform: function(data, panel, model) {
    if (!data || data.length === 0) {
      return;
    }

    const noTableIndex = _.findIndex(data, d => d.type !== 'table');
    if (noTableIndex > -1) {
      throw {
        message: `Result of query #${String.fromCharCode(
          65 + noTableIndex
        )} is not in table format, try using another transform.`,
      };
    }

    // Single query returns data columns and rows as is
    if (data.length === 1) {
      model.columns = [...data[0].columns];
      model.rows = [...data[0].rows];
      return;
    }

    // Track column indexes of union: name -> index
    const columnNames = {};

    // Union of all non-value columns
    const columnsUnion = data.reduce((acc, series) => {
      series.columns.forEach(col => {
        const {text} = col;
        if (columnNames[text] === undefined) {
          columnNames[text] = acc.length;
          acc.push(col);
        }
      });
      return acc;
    }, []);

    // Map old column index to union index per series, e.g.,
    // given columnNames {A: 0, B: 1} and
    // data [{columns: [{ text: 'A' }]}, {columns: [{ text: 'B' }]}] => [[0], [1]]
    const columnIndexMapper = data.map(series =>
      series.columns.map(col => columnNames[col.text])
    );

    // Flatten rows of all series and adjust new column indexes
    const flattenedRows = data.reduce((acc, series, seriesIndex) => {
      const mapper = columnIndexMapper[seriesIndex];
      series.rows.forEach(row => {
        const alteredRow = [];
        // Shifting entries according to index mapper
        mapper.forEach((to, from) => {
          alteredRow[to] = row[from];
        });
        acc.push(alteredRow);
      });
      return acc;
    }, []);

    // Returns true if both rows have matching non-empty fields as well as matching
    // indexes where one field is empty and the other is not
    function areRowsMatching(columns, row, otherRow) {
      let foundFieldToMatch = false;
      for (let columnIndex = 0; columnIndex < columns.length; columnIndex++) {
        if (row[columnIndex] !== undefined && otherRow[columnIndex] !== undefined) {
          if (row[columnIndex] !== otherRow[columnIndex]) {
            return false;
          }
        } else if (
          row[columnIndex] === undefined ||
          otherRow[columnIndex] === undefined
        ) {
          foundFieldToMatch = true;
        }
      }
      return foundFieldToMatch;
    }

    // Merge rows that have same values for columns
    const mergedRows = {};
    const compactedRows = flattenedRows.reduce((acc, row, rowIndex) => {
      if (!mergedRows[rowIndex]) {
        // Look from current row onwards
        let offset = rowIndex + 1;
        // More than one row can be merged into current row
        while (offset < flattenedRows.length) {
          // Find next row that could be merged
          const match = _.findIndex(
            flattenedRows,
            otherRow => areRowsMatching(columnsUnion, row, otherRow),
            offset
          );
          if (match > -1) {
            const matchedRow = flattenedRows[match];
            // Merge values from match into current row if there is a gap in the current row
            for (let columnIndex = 0; columnIndex < columnsUnion.length; columnIndex++) {
              if (
                row[columnIndex] === undefined &&
                matchedRow[columnIndex] !== undefined
              ) {
                row[columnIndex] = matchedRow[columnIndex];
              }
            }
            // Dont visit this row again
            mergedRows[match] = matchedRow;
            // Keep looking for more rows to merge
            offset = match + 1;
          } else {
            // No match found, stop looking
            break;
          }
        }
        acc.push(row);
      }
      return acc;
    }, []);

    model.columns = columnsUnion;
    model.rows = compactedRows;
  },
};

transformers['json'] = {
  description: 'JSON Data',
  getColumns: function(data) {
    if (!data || data.length === 0) {
      return [];
    }

    let names: any = {};
    for (let i = 0; i < data.length; i++) {
      let series = data[i];
      if (series.type !== 'docs') {
        continue;
      }

      // only look at 100 docs
      let maxDocs = Math.min(series.datapoints.length, 100);
      for (let y = 0; y < maxDocs; y++) {
        let doc = series.datapoints[y];
        let flattened = flatten(doc, null);
        for (let propName in flattened) {
          names[propName] = true;
        }
      }
    }

    return _.map(names, function(value, key) {
      return {text: key, value: key};
    });
  },
  transform: function(data, panel, model) {
    let i, y, z;

    for (let column of panel.columns) {
      let tableCol: any = {text: column.text};

      // if filterable data then set columns to filterable
      if (data.length > 0 && data[0].filterable) {
        tableCol.filterable = true;
      }

      model.columns.push(tableCol);
    }

    if (model.columns.length === 0) {
      model.columns.push({text: 'JSON'});
    }

    for (i = 0; i < data.length; i++) {
      let series = data[i];

      for (y = 0; y < series.datapoints.length; y++) {
        let dp = series.datapoints[y];
        let values = [];

        if (_.isObject(dp) && panel.columns.length > 0) {
          let flattened = flatten(dp, null);
          for (z = 0; z < panel.columns.length; z++) {
            values.push(flattened[panel.columns[z].value]);
          }
        } else {
          values.push(JSON.stringify(dp));
        }

        model.rows.push(values);
      }
    }
  },
};

transformers['parsing_decoder'] = {
  parsingCodes: {
    channel: [
      'Invalid packet length',
      'End of data frame reached',
      'Time stamp specifies future time',
      'Invalid number of samples',
      'Invalid authentication switch',
      'Invalid compression switch',
      'Trailing bytes in DFF subframe',
      'Invalid calibration period',
      'Invalid authentication offset',
      'Invalid option switch',
      'Invalid status size',
      'Invalid channel data size',
      'Steim compression not supported',
      'Channel not signed',
      'Invalid channel signature',
      'No certificate found for channel',
      'Invalid Candian compressed data',
      'Unsupported data type',
      'Unexpected signature verification error',
      'Invalid channel time stamp',
      'Invalid calibration factor',
      'Channel start time not within one sample',
      'Invalid site or channel name',
    ],
    frame: [
      'Internal error',
      'Invalid channel(s) in frame',
      'Invalid data frame size',
      'Nominal time specifies future time',
      'Invalid description size',
      'Invalid max. DF size',
      'Invalid channel number',
      'Invalid DFF frame size',
      'Invalid CRC',
      'Frame has channel warning(s)',
      'Invalid frame size',
      'Frame too large',
      'Protocol violation',
      'Frame not signed',
      'Invalid signature',
      'No certificate found',
      'Unsupported frame type (yet)',
      'No certificates loaded',
      'Channel authentication failed',
      'Unknown frame type',
      'Frame not (complete) parsed',
      'Invalid alert type',
      'Invalid station name',
      'Invalid command size',
      'Frame has channel error(s)',
      'Station is not allowed to send commands',
      'Invalid channel string size',
      'Invalid frame time length',
      'Command frame too old',
    ],
  },

  description: 'Frame and channel parsing decoder',
  getColumns: function() {
    return [];
  },
  transform: function(data, panel, model) {
    let parsingCode = this.parsingCodes[panel.parsingCodeType];
    model.columns = [{text: 'Station'}, {text: 'Error Message'}];
    let codeByStation = {};

    for (let i = 0; i < data[0].datapoints.length; i++) {
      if (data[1].datapoints[i][0] == null) continue;
      if (typeof codeByStation[data[0].datapoints[i][0]] !== 'undefined') {
        codeByStation[data[0].datapoints[i][0]] |= parseInt(data[1].datapoints[i][0], 10);
      } else {
        codeByStation[data[0].datapoints[i][0]] = parseInt(data[1].datapoints[i][0], 10);
      }
    }
    let stations = Object.keys(codeByStation).sort();
    for (let i in stations) {
      let decodedString = [];
      let bitPosition = 1;
      for (let j = 0; j < parsingCode.length; j++) {
        let parsedCode = codeByStation[stations[i]] & (bitPosition << j);
        if (parsedCode != 0) {
          model.rows.push([stations[i], parsingCode[j]]);
        }
      }
    }
  },
};

transformers['channel_parsing_decoder'] = {
  parsingCodes: {
    channel: [
      'Invalid packet length',
      'End of data frame reached',
      'Time stamp specifies future time',
      'Invalid number of samples',
      'Invalid authentication switch',
      'Invalid compression switch',
      'Trailing bytes in DFF subframe',
      'Invalid calibration period',
      'Invalid authentication offset',
      'Invalid option switch',
      'Invalid status size',
      'Invalid channel data size',
      'Steim compression not supported',
      'Channel not signed',
      'Invalid channel signature',
      'No certificate found for channel',
      'Invalid Candian compressed data',
      'Unsupported data type',
      'Unexpected signature verification error',
      'Invalid channel time stamp',
      'Invalid calibration factor',
      'Channel start time not within one sample',
      'Invalid site or channel name',
    ],
  },

  description: 'Channel parsing decoder',
  getColumns: function() {
    return [];
  },
  transform: function(data, panel, model) {
    let parsingCode = this.parsingCodes['channel'];
    model.columns = [{text: 'Station'}, {text: 'Site/Channel'}, {text: 'Error Message'}];
    let codeByStation = {};
    let rows = data[0]['rows'];

    for (let i = 0; i < rows.length; i++) {
      //if (data[2].datapoints[i][0] == null) continue;
      if (typeof codeByStation[rows[i][1] + ':' + rows[i][2]] !== 'undefined') {
        codeByStation[rows[i][1] + ':' + rows[i][2]] |= parseInt(rows[i][3], 10);
      } else {
        codeByStation[rows[i][1] + ':' + rows[i][2]] = parseInt(rows[i][3], 10);
      }
    }
    let stations = Object.keys(codeByStation).sort();
    for (let i in stations) {
      let decodedString = [];
      let bitPosition = 1;
      for (let j = 0; j < parsingCode.length; j++) {
        let parsedCode = codeByStation[stations[i]] & (bitPosition << j);
        if (parsedCode != 0) {
          let sta_chan = stations[i].split(':');
          model.rows.push([
            sta_chan[0],
            sta_chan[1].replace(/(.+)\/$/, '$1'),
            parsingCode[j],
          ]);
        }
      }
    }
  },
};

transformers['qualityflags_decoder'] = {
  parsingCodes: {
    qualityflags: [
      'Constant data detected',
      'No input from sensor detected',
      'Data not checked',
      'Data arrived too late',
      'Data authentication failed', //'Invalid channel signature'
      'Data not authenticated',
      'No cert for data found',
      'Data not signed', //'Channel not signed'
      'Frame authentication failed',
      'Frame not authenticated',
      'No cert for frame found',
      'Frame not signed',
      'Frame authentication N/A',
      'Frame authentication N/A',
      'Frame authentication N/A',
      'Frame authentication N/A',
    ],
  },

  description: 'Qualityflags decoder',
  getColumns: function() {
    return [];
  },
  transform: function(data, panel, model) {
    let parsingCode = this.parsingCodes[panel.parsingCodeType];
    model.columns = [
      {text: 'Station'},
      {text: 'Site'},
      {text: 'Channel'},
      {text: 'Error Message'},
    ];
    let codeByStation = {};

    for (let i = 0; i < data[0].datapoints.length; i++) {
      if (data[2].datapoints[i][0] == null) continue;
      if (
        typeof codeByStation[
          data[0].datapoints[i][0] +
            ':' +
            data[1].datapoints[i][0] +
            ':' +
            data[2].datapoints[i][0]
        ] !== 'undefined'
      ) {
        codeByStation[
          data[0].datapoints[i][0] +
            ':' +
            data[1].datapoints[i][0] +
            ':' +
            data[2].datapoints[i][0]
        ] |= parseInt(data[3].datapoints[i][0], 10);
      } else {
        codeByStation[
          data[0].datapoints[i][0] +
            ':' +
            data[1].datapoints[i][0] +
            ':' +
            data[2].datapoints[i][0]
        ] = parseInt(data[3].datapoints[i][0], 10);
      }
    }
    let stations = Object.keys(codeByStation).sort();
    for (let i in stations) {
      let decodedString = [];
      let bitPosition = 1;
      for (let j = 0; j < parsingCode.length; j++) {
        let parsedCode = codeByStation[stations[i]] & (bitPosition << j);
        if (panel.onlyRelatedAuthentication) parsedCode = parsedCode & 0xff0;
        if (parsedCode != 0) {
          let sta_chan = stations[i].split(':');
          model.rows.push([sta_chan[0], sta_chan[1], sta_chan[2], parsingCode[j]]);
        }
      }
    }
  },
};

function transformDataToTable(data, panel) {
  let model = new TableModel();

  if (!data || data.length === 0) {
    return model;
  }

  let transformer = transformers[panel.transform];
  if (!transformer) {
    throw {message: 'Transformer ' + panel.transform + ' not found'};
  }

  transformer.transform(data, panel, model);
  return model;
}

export {transformers, transformDataToTable};
